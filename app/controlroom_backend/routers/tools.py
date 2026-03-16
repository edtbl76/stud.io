"""
Tools router — covers 5 tool tables under /tools/<category>:
  workflow, measurement, reference, composition, admin

measurement and reference have model_ids; the others don't.
ToolOut normalizes the per-table PK into `tool_id` for a uniform response shape.
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from database import get_conn
from routers.auth import require_admin, UserOut
from schemas.tools import ToolCreate, ToolUpdate, ToolOut

router = APIRouter()

_NOT_FOUND = "Tool not found"


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
        raise HTTPException(status_code=404, detail=f"Unknown tool category: {category}")
    return cfg


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/{category}", response_model=list[ToolOut])
async def list_tools(category: str, q: str | None = None, *, conn: Annotated[Connection, Depends(get_conn)]):
    cfg = _cfg(category)
    sel = f"SELECT * FROM {cfg['view']}"
    if q:
        rows = await conn.fetch(sel + " WHERE tool_name ILIKE $1 OR brand_name ILIKE $1", f"%{q}%")
    else:
        rows = await conn.fetch(sel)
    return [_row_to_out(r, cfg["id_col"]) for r in rows]


@router.get("/{category}/{tool_id}", response_model=ToolOut, responses={404: {"description": "Not found"}})
async def get_tool(category: str, tool_id: UUID, conn: Annotated[Connection, Depends(get_conn)]):
    cfg = _cfg(category)
    row = await conn.fetchrow(
        f"SELECT * FROM {cfg['view']} WHERE {cfg['id_col']} = $1", tool_id
    )
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return _row_to_out(row, cfg["id_col"])


@router.post("/{category}", response_model=ToolOut, status_code=201)
async def create_tool(category: str, payload: ToolCreate, conn: Annotated[Connection, Depends(get_conn)], _: Annotated[UserOut, Depends(require_admin)]):
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
    row = await conn.fetchrow(
        f"INSERT INTO {cfg['table']} ({', '.join(cols)}) VALUES ({placeholders}) "
        f"RETURNING {cfg['id_col']}",
        *vals,
    )
    return await get_tool(category, row[cfg["id_col"]], conn)


@router.patch("/{category}/{tool_id}", response_model=ToolOut, responses={404: {"description": "Not found"}})
async def update_tool(category: str, tool_id: UUID, payload: ToolUpdate, conn: Annotated[Connection, Depends(get_conn)], _: Annotated[UserOut, Depends(require_admin)]):
    cfg = _cfg(category)
    if not await conn.fetchrow(
        f"SELECT 1 FROM {cfg['table']} WHERE {cfg['id_col']} = $1", tool_id
    ):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)

    updates = payload.model_dump(exclude_unset=True)
    if not cfg["has_model_ids"]:
        updates.pop("model_ids", None)
    if not updates:
        return await get_tool(category, tool_id, conn)

    set_clauses = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(updates))
    await conn.execute(
        f"UPDATE {cfg['table']} SET {set_clauses}, updated_at = NOW() "
        f"WHERE {cfg['id_col']} = $1",
        tool_id, *updates.values(),
    )
    return await get_tool(category, tool_id, conn)


@router.delete("/{category}/{tool_id}", status_code=204, responses={404: {"description": "Not found"}})
async def delete_tool(category: str, tool_id: UUID, conn: Annotated[Connection, Depends(get_conn)], _: Annotated[UserOut, Depends(require_admin)]):
    cfg = _cfg(category)
    if not await conn.fetchrow(
        f"SELECT 1 FROM {cfg['table']} WHERE {cfg['id_col']} = $1", tool_id
    ):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    await conn.execute(f"DELETE FROM {cfg['table']} WHERE {cfg['id_col']} = $1", tool_id)
