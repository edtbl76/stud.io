import re
from dataclasses import dataclass, field
from datetime import date as Date
from typing import Callable, Awaitable, Any
from uuid import UUID

from asyncpg import Connection
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from routers._helpers import (
    AuditEntryWithData,
    get_record_history,
    _serializable,
    log_audit,
)
from routers.auth import UserOut
from routers.filter_operators import (
    FilterEntry,
    FilterableField,
    DEFAULT_OPERATOR,
    VALUE_FREE_OPERATORS,
    DATE_OPERATORS,
    DATE_RANGE_OPERATORS,
    VALID_OPERATORS,
    OPERATOR_BUILDERS,
    build_value_free_sql,
)

from schemas.common import ListParams, PagedResponse

_FILTER_PREFIX = "filter_"
_FILTER_OP_SUFFIX = "_op"
_FILTER_END_SUFFIX = "_end"
_FILTER_KEY_RE = re.compile(r'^[a-z_]+$')
_ILIKE_COL_RE = re.compile(r'([a-z_][a-z0-9_]*) ILIKE \{val\}')
_EMPTY_SENTINEL = '""'


@dataclass
class EntityConfig:
    """ Static, defined once per router """
    table_name: str
    view_name: str
    id_column: str
    search_where: str  # deprecated — kept for compatibility, no longer used by list_entities
    sortable: frozenset[str]
    default_sort: str
    not_found_msg: str
    ref_check: Callable[[Connection, UUID], Awaitable[None]] | None = None
    filterable: dict[str, FilterableField] = field(default_factory=dict)


def _extract_raw_and_ops(
    request: Request,
) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    """Split filter_* query params into raw values, operator overrides, and range ends."""
    raw: dict[str, str] = {}
    ops: dict[str, str] = {}
    ends: dict[str, str] = {}
    for k, v in request.query_params.items():
        if not k.startswith(_FILTER_PREFIX):
            continue
        key = k[len(_FILTER_PREFIX):]
        if key.endswith(_FILTER_OP_SUFFIX):
            col_key = key[: -len(_FILTER_OP_SUFFIX)]
            if _FILTER_KEY_RE.match(col_key) and v in VALID_OPERATORS:
                ops[col_key] = v
        elif key.endswith(_FILTER_END_SUFFIX):
            col_key = key[: -len(_FILTER_END_SUFFIX)]
            if _FILTER_KEY_RE.match(col_key):
                ends[col_key] = v
        elif _FILTER_KEY_RE.match(key):
            raw[key] = v
    return raw, ops, ends


def parse_filters(request: Request) -> dict[str, FilterEntry]:
    """Extract filter_* query params from the request, returning FilterEntry per key.

    Wire format: filter_<key>=value         (operator defaults to 'contains')
                 filter_<key>_op=operator   (explicit operator override)
                 filter_<key>_end=value     (range end for date_between)
    Value-free operators send only _op with no value.
    """
    raw, ops, ends = _extract_raw_and_ops(request)
    result: dict[str, FilterEntry] = {}
    for key, value in raw.items():
        if value == _EMPTY_SENTINEL:
            result[key] = FilterEntry(value="", operator="is_empty")  # type: ignore[arg-type]
            continue
        operator = ops.get(key, DEFAULT_OPERATOR)
        if not value and operator not in VALUE_FREE_OPERATORS:
            continue
        value_end = ends.get(key) if operator in DATE_RANGE_OPERATORS else None
        result[key] = FilterEntry(value=value, operator=operator, value_end=value_end)  # type: ignore[arg-type]

    for key, operator in ops.items():
        if key not in result and operator in VALUE_FREE_OPERATORS:
            result[key] = FilterEntry(value="", operator=operator)  # type: ignore[arg-type]

    return result


def _parse_date(value: str) -> Date | str:
    """Parse an ISO date string to datetime.date; return original string on failure."""
    try:
        return Date.fromisoformat(value)
    except ValueError:
        return value


def _append_filter(
    parts: list[str],
    values: list[Any],
    idx: int,
    field_def: FilterableField,
    entry: FilterEntry,
) -> int:
    """Append one filter expression to parts/values. Returns updated bind-param index."""
    operator = entry.operator
    if operator == "contains":
        if not field_def.contains_expr:
            return idx
        parts.append(f"({field_def.contains_expr.replace('{val}', f'${idx}')})")
        values.append(f"%{entry.value}%")
        return idx + 1
    if operator in VALUE_FREE_OPERATORS:
        sql = build_value_free_sql(field_def, operator)
        if sql:
            parts.append(f"({sql})")
        return idx
    if not field_def.col_expr:
        return idx
    sql_frag, _ = OPERATOR_BUILDERS[operator](field_def.col_expr, idx)
    parts.append(f"({sql_frag})")
    if operator in DATE_RANGE_OPERATORS:
        end = entry.value_end or entry.value
        values.extend([_parse_date(entry.value), _parse_date(end)])
        return idx + 2
    bind_val = _parse_date(entry.value) if operator in DATE_OPERATORS else entry.value
    values.append(bind_val)
    return idx + 1


def build_filter_clause(
    filterable: dict[str, FilterableField],
    filters: dict[str, FilterEntry],
) -> tuple[str, list[Any]]:
    """Build a parameterized WHERE clause from active column filters.

    Returns (where_sql, bind_values). Unknown filter keys are silently ignored.
    """
    parts: list[str] = []
    values: list[Any] = []
    idx = 1
    for key, entry in filters.items():
        field_def = filterable.get(key)
        if field_def:
            idx = _append_filter(parts, values, idx, field_def, entry)
    if not parts:
        return "", []
    return "WHERE " + " AND ".join(parts), values


def _build_null_expr(contains_expr: str) -> str:
    """Derive an is_empty SQL expression from a contains_expr template.

    Extracts each column name from ILIKE {val} patterns and returns
    the corresponding (col IS NULL OR col = '') fragments joined by OR.
    Returns an empty string if no ILIKE patterns are found.
    """
    cols = _ILIKE_COL_RE.findall(contains_expr)
    if not cols:
        return ""
    return " OR ".join(f"({col} IS NULL OR {col} = '')" for col in cols)


def _build_order_clause(
    sort_by: list[str],
    sort_dir: list[str],
    sortable: frozenset[str],
    default_sort: str,
) -> str:
    """Build a multi-column ORDER BY clause, validating each column against sortable."""
    terms: list[str] = []
    for i, key in enumerate(sort_by):
        if key not in sortable:
            continue
        direction = "DESC" if i < len(sort_dir) and sort_dir[i].lower() == "desc" else "ASC"
        terms.append(f"{key} {direction}")
    if not terms:
        terms.append(f"{default_sort} ASC")
    return "ORDER BY " + ", ".join(terms)


# noinspection SqlInjection
async def list_entities(
    conn: Connection,
    config: EntityConfig,
    params: ListParams,
    model_cls: type,
    filters: dict[str, FilterEntry] | None = None,
):
    """ List entities from a database, with optional per-column filtering and sorting """
    order = _build_order_clause(params.sort_by, params.sort_dir, config.sortable, config.default_sort)
    where, bind_vals = build_filter_clause(config.filterable, filters or {})
    n = len(bind_vals)
    total = await conn.fetchval(
        f"SELECT COUNT(*) FROM {config.view_name} {where}", *bind_vals
    )
    rows = await conn.fetch(
        f"SELECT * FROM {config.view_name} {where} {order} LIMIT ${n + 1} OFFSET ${n + 2}",
        *bind_vals, params.limit, params.offset,
    )
    return PagedResponse(items=[model_cls(**dict(r)) for r in rows], total=total)

# noinspection SqlInjection
async def get_entity(conn: Connection, config: EntityConfig, entity_id: UUID, model_cls: type):
    """ Get a single entity by ID, or raise 404 if not found """
    row = await conn.fetchrow(f"SELECT * FROM {config.view_name} WHERE {config.id_column} = $1", entity_id)
    if not row:
        raise HTTPException(status_code=404, detail=config.not_found_msg)  # NOSONAR
    return model_cls(**dict(row))


_PARENT_REF_TABLES = ["effects", "instruments", "libraries"]


# noinspection SqlInjection
async def check_parent_refs(conn: Connection, entity_id: UUID, entity_label: str) -> None:
    """Raise 409 if entity_id is referenced as a parent in any of the three parent-ref tables."""
    for table in _PARENT_REF_TABLES:
        if await conn.fetchrow(
            f"SELECT 1 FROM {table} WHERE deleted_at IS NULL AND EXISTS "
            f"(SELECT 1 FROM unnest(parent_ids) p WHERE (p).id = $1) LIMIT 1",
            entity_id,
        ):
            raise HTTPException(
                status_code=409,
                detail=f"{entity_label} is referenced as a parent in {table}",
            )


async def get_history(conn: Connection, config: EntityConfig, entity_id: UUID) -> list[AuditEntryWithData]:
    return await get_record_history(conn, config.table_name, entity_id)


# noinspection SqlInjection
async def delete_entity(conn: Connection, config: EntityConfig, entity_id: UUID, user: UserOut):
    """ Delete an entity by ID, or raise 404 if not found """
    row = await conn.fetchrow(f"SELECT * FROM {config.table_name} WHERE {config.id_column} = $1", entity_id)
    if not row:
        raise HTTPException(status_code=404, detail=config.not_found_msg)

    if row["deleted_at"] is not None:
        return JSONResponse(
            status_code=200,
            content={"detail": "Record is already deleted. To permanently remove it, use Change Review."}
        )

    if config.ref_check:
        await config.ref_check(conn, entity_id)

    async with conn.transaction():
        await conn.execute(f"UPDATE {config.table_name} SET deleted_at = NOW() WHERE {config.id_column} = $1",
                           entity_id)
        await log_audit(conn, config.table_name, entity_id, "DELETE",
                        performed_by=user.username,
                        old_data=_serializable(dict(row)))
