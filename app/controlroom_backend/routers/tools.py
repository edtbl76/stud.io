"""
Tools router — covers 5 tool tables under /tools/<category>:
  workflow, measurement, reference, composition, admin

measurement and reference have model_ids; the others don't.
ToolOut normalizes the per-table PK into `tool_id` for a uniform response shape.
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from asyncpg import Connection

from database import get_conn
from routers._crud_ops import build_filter_clause, parse_filters, _build_order_clause
from routers.filter_operators import FilterableField, FilterEntry
from routers.auth import require_admin, get_current_user, UserOut
from schemas.tools import ToolCreate, ToolUpdate, ToolOut
from schemas.common import PagedResponse, ListParams
from routers._helpers import _serializable, log_audit, get_record_history, AuditEntryWithData

router = APIRouter()

_NOT_FOUND = "Tool not found"
_SORTABLE = frozenset({"full_tool_name", "brand_name", "version", "created_at", "updated_at"})
_DEFAULT_SORT = "full_tool_name"
_FILTERABLE: dict[str, FilterableField] = {
    "name":    FilterableField("full_tool_name ILIKE {val}", col_expr="full_tool_name"),
    "brand":   FilterableField("brand_name ILIKE {val}",    col_expr="brand_name"),
    "version": FilterableField("version ILIKE {val}",       col_expr="version"),
    "types": FilterableField(
        "EXISTS (SELECT 1 FROM unnest(COALESCE(tool_type_ids, ARRAY[]::UUID[])) uid"
        " JOIN tool_types t ON t.type_id = uid WHERE t.type_name ILIKE {val})",
        empty_expr="(tool_type_ids IS NULL OR cardinality(tool_type_ids) = 0)",
    ),
    "formats": FilterableField(
        "EXISTS (SELECT 1 FROM unnest(COALESCE(plugin_format_ids, ARRAY[]::UUID[])) uid"
        " JOIN plugin_formats t ON t.type_id = uid WHERE t.type_name ILIKE {val})",
        empty_expr="(plugin_format_ids IS NULL OR cardinality(plugin_format_ids) = 0)",
    ),
    "created_at": FilterableField(col_expr="created_at"),
    "updated_at": FilterableField(col_expr="updated_at"),
}


# ---------------------------------------------------------------------------
# Config per tool category
# ---------------------------------------------------------------------------
_CONFIGS = {
    "workflow": {
        "table": "workflow_tools",
        "id_col": "workflow_tool_id",
        "view": "workflow_tools_view",
        "has_model_ids": False,
    },
    "measurement": {
        "table": "measurement_tools",
        "id_col": "measurement_tool_id",
        "view": "measurement_tools_view",
        "has_model_ids": True,
    },
    "reference": {
        "table": "reference_tools",
        "id_col": "reference_tool_id",
        "view": "reference_tools_view",
        "has_model_ids": True,
    },
    "composition": {
        "table": "composition_tools",
        "id_col": "composition_tool_id",
        "view": "composition_tools_view",
        "has_model_ids": False,
    },
    "admin": {
        "table": "admin_tools",
        "id_col": "admin_tool_id",
        "view": "admin_tools_view",
        "has_model_ids": False,
    },
}


def _row_to_out(row, id_col: str) -> ToolOut:
    d = dict(row)
    d["tool_id"] = d.pop(id_col)
    return ToolOut(**d)


def _cfg(category: str) -> dict:
    cfg = _CONFIGS.get(category)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Unknown tool category: {category}")  # NOSONAR
    return cfg


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

# noinspection SqlInjection
@router.get("/{category}", response_model=PagedResponse[ToolOut])
async def list_tools(
    category: str,
    params: Annotated[ListParams, Depends()],
    conn: Annotated[Connection, Depends(get_conn)],
    filters: Annotated[dict[str, FilterEntry], Depends(parse_filters)],
):
    cfg = _cfg(category)
    order = _build_order_clause(params.sort_by, params.sort_dir, _SORTABLE, _DEFAULT_SORT)
    where, bind_vals = build_filter_clause(_FILTERABLE, filters)
    n = len(bind_vals)
    total = await conn.fetchval(
        f"SELECT COUNT(*) FROM {cfg['view']} {where}", *bind_vals
    )
    rows = await conn.fetch(
        f"SELECT * FROM {cfg['view']} {where} {order} LIMIT ${n + 1} OFFSET ${n + 2}",
        *bind_vals, params.limit, params.offset,
    )
    return PagedResponse(items=[_row_to_out(r, cfg["id_col"]) for r in rows], total=total)


@router.get("/{category}/{tool_id}", response_model=ToolOut, responses={404: {"description": "Not found"}})
async def get_tool(category: str, tool_id: UUID, conn: Annotated[Connection, Depends(get_conn)]):
    cfg = _cfg(category)
    row = await conn.fetchrow(
        f"SELECT * FROM {cfg['view']} WHERE {cfg['id_col']} = $1", tool_id
    )
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)  # NOSONAR
    return _row_to_out(row, cfg["id_col"])


@router.post("/{category}", response_model=ToolOut, status_code=201)
async def create_tool(category: str, payload: ToolCreate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    cfg = _cfg(category)
    cols = ["tool_name", "brand_id", "version", "tool_type_ids",
            "plugin_format_ids", "description", "workflow_notes", "tag_ids"]
    vals = [payload.tool_name, payload.brand_id, payload.version,
            payload.tool_type_ids, payload.plugin_format_ids,
            payload.description, payload.workflow_notes, payload.tag_ids]

    if cfg["has_model_ids"]:
        cols.insert(1, "model_ids")
        vals.insert(1, payload.model_ids)

    placeholders = ", ".join(f"${i+1}" for i in range(len(vals)))
    async with conn.transaction():
        row = await conn.fetchrow(
            f"INSERT INTO {cfg['table']} ({', '.join(cols)}) VALUES ({placeholders}) "
            f"RETURNING {cfg['id_col']}",
            *vals,
        )
        new_row = await conn.fetchrow(
            f"SELECT * FROM {cfg['table']} WHERE {cfg['id_col']} = $1", row[cfg["id_col"]]
        )
        await log_audit(conn, cfg["table"], row[cfg["id_col"]], "CREATE",
                        performed_by=user.username, new_data=_serializable(dict(new_row)))
    return await get_tool(category, row[cfg["id_col"]], conn)


@router.patch("/{category}/{tool_id}", response_model=ToolOut, responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
async def update_tool(category: str, tool_id: UUID, payload: ToolUpdate, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    cfg = _cfg(category)
    old_row = await conn.fetchrow(
        f"SELECT * FROM {cfg['table']} WHERE {cfg['id_col']} = $1", tool_id
    )
    if not old_row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if old_row["deleted_at"] is not None:
        raise HTTPException(status_code=409, detail="Cannot update a deleted record")

    updates = payload.model_dump(exclude_unset=True)
    if not cfg["has_model_ids"]:
        updates.pop("model_ids", None)
    if not updates:
        return await get_tool(category, tool_id, conn)

    set_clauses = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(updates))
    async with conn.transaction():
        await conn.execute(
            f"UPDATE {cfg['table']} SET {set_clauses}, updated_at = NOW() "
            f"WHERE {cfg['id_col']} = $1",
            tool_id, *updates.values(),
        )
        new_row = await conn.fetchrow(
            f"SELECT * FROM {cfg['table']} WHERE {cfg['id_col']} = $1", tool_id
        )
        await log_audit(conn, cfg["table"], tool_id, "UPDATE",
                        performed_by=user.username,
                        old_data=_serializable(dict(old_row)),
                        new_data=_serializable(dict(new_row)))
    return await get_tool(category, tool_id, conn)


@router.get("/{category}/{tool_id}/history", responses={401: {"description": "Unauthorized"}})
async def get_tool_history(
    category: str,
    tool_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> list[AuditEntryWithData]:
    cfg = _cfg(category)
    return await get_record_history(conn, cfg["table"], tool_id)


@router.delete("/{category}/{tool_id}", status_code=204, responses={404: {"description": "Not found"}})
async def delete_tool(category: str, tool_id: UUID, conn: Annotated[Connection, Depends(get_conn)], user: Annotated[UserOut, Depends(require_admin)]):
    cfg = _cfg(category)
    row = await conn.fetchrow(
        f"SELECT * FROM {cfg['table']} WHERE {cfg['id_col']} = $1", tool_id
    )
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if row["deleted_at"] is not None:
        return JSONResponse(
            status_code=200,
            content={"detail": "Record is already deleted. To permanently remove it, use Change Review."}
        )
    async with conn.transaction():
        await conn.execute(
            f"UPDATE {cfg['table']} SET deleted_at = NOW() WHERE {cfg['id_col']} = $1", tool_id
        )
        await log_audit(conn, cfg["table"], tool_id, "DELETE",
                        performed_by=user.username, old_data=_serializable(dict(row)))
