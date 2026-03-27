import re
from dataclasses import dataclass, field
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

from schemas.common import ListParams, PagedResponse

_FILTER_PREFIX = "filter_"
_FILTER_KEY_RE = re.compile(r'^[a-z_]+$')


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
    filterable: dict[str, str] = field(default_factory=dict)


def parse_filters(request: Request) -> dict[str, str]:
    """Extract filter_* query params from the request, validating key names."""
    result: dict[str, str] = {}
    for k, v in request.query_params.items():
        if k.startswith(_FILTER_PREFIX) and v:
            key = k[len(_FILTER_PREFIX):]
            if _FILTER_KEY_RE.match(key):
                result[key] = v
    return result


def build_filter_clause(
    filterable: dict[str, str],
    filters: dict[str, str],
) -> tuple[str, list[Any]]:
    """Build a parameterized WHERE clause from active column filters.

    Returns (where_sql, bind_values). Unknown filter keys are silently ignored.
    Values wrapped in double quotes use exact-match (=) instead of ILIKE.
    """
    parts: list[str] = []
    values: list[Any] = []
    idx = 1
    for key, raw_value in filters.items():
        expr_template = filterable.get(key)
        if not expr_template:
            continue
        is_exact = raw_value.startswith('"') and raw_value.endswith('"') and len(raw_value) >= 2
        if is_exact:
            stripped = raw_value[1:-1]
            expr = expr_template.replace("ILIKE {val}", f"= ${idx}").replace("{val}", f"${idx}")
            values.append(stripped)
        else:
            expr = expr_template.replace("{val}", f"${idx}")
            values.append(f"%{raw_value}%")
        parts.append(f"({expr})")
        idx += 1
    if not parts:
        return "", []
    return "WHERE " + " AND ".join(parts), values


# noinspection SqlInjection
async def list_entities(
    conn: Connection,
    config: EntityConfig,
    params: ListParams,
    model_cls: type,
    filters: dict[str, str] | None = None,
):
    """ List entities from a database, with optional per-column filtering and sorting """
    col = params.sort_by if params.sort_by in config.sortable else config.default_sort
    direction = "DESC" if params.sort_dir.lower() == "desc" else "ASC"
    order = f"ORDER BY {col} {direction}"
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
