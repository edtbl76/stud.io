"""
Config router — CRUD for all 7 lookup tables under /config/<table>.
Tables: entity-types, tag-types, plugin-formats, model-types,
        effect-types, instrument-types, tool-types
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection

from database import get_conn
from routers.auth import require_admin, UserOut
from schemas.config import LookupCreate, LookupUpdate, LookupOut

router = APIRouter()

# Maps URL slug → DB table name
_TABLES = {
    "entity-types":     "entity_types",
    "tag-types":        "tag_types",
    "plugin-formats":   "plugin_formats",
    "model-types":      "model_types",
    "effect-types":     "effect_types",
    "instrument-types": "instrument_types",
    "tool-types":       "tool_types",
}

# Where each lookup type_id is used (for delete safety checks)
_REFS = {
    "entity_types":     [("brands",            "entity_type_id",    False)],
    "tag_types":        [("effects",            "tag_ids",           True),
                         ("instruments",        "tag_ids",           True),
                         ("libraries",          "tag_ids",           True),
                         ("workstations",       "tag_ids",           True),
                         ("workflow_tools",     "tag_ids",           True),
                         ("measurement_tools",  "tag_ids",           True),
                         ("reference_tools",    "tag_ids",           True),
                         ("composition_tools",  "tag_ids",           True),
                         ("admin_tools",        "tag_ids",           True)],
    "plugin_formats":   [("effects",            "plugin_format_ids", True),
                         ("instruments",        "plugin_format_ids", True),
                         ("workstations",       "plugin_format_ids", True),
                         ("workflow_tools",     "plugin_format_ids", True),
                         ("measurement_tools",  "plugin_format_ids", True),
                         ("reference_tools",    "plugin_format_ids", True),
                         ("composition_tools",  "plugin_format_ids", True),
                         ("admin_tools",        "plugin_format_ids", True)],
    "model_types":      [("models",             "model_type_ids",    True)],
    "effect_types":     [("effects",            "effect_type_ids",   True)],
    "instrument_types": [("instruments",        "instrument_type_ids", True)],
    "tool_types":       [("effects",            "tool_type_ids",     True),
                         ("instruments",        "tool_type_ids",     True),
                         ("workstations",       "tool_type_ids",     True),
                         ("workflow_tools",     "tool_type_ids",     True),
                         ("measurement_tools",  "tool_type_ids",     True),
                         ("reference_tools",    "tool_type_ids",     True),
                         ("composition_tools",  "tool_type_ids",     True),
                         ("admin_tools",        "tool_type_ids",     True)],
}


def _resolve(slug: str) -> str:
    table = _TABLES.get(slug)
    if not table:
        raise HTTPException(status_code=404, detail=f"Unknown config table: {slug}")
    return table


@router.get("/{slug}", response_model=list[LookupOut])
async def list_lookup(slug: str, conn: Annotated[Connection, Depends(get_conn)]):
    table = _resolve(slug)
    rows = await conn.fetch(f"SELECT * FROM {table} ORDER BY type_name")
    return [LookupOut(**dict(r)) for r in rows]


@router.get("/{slug}/{type_id}", response_model=LookupOut)
async def get_lookup(slug: str, type_id: UUID, conn: Annotated[Connection, Depends(get_conn)]):
    table = _resolve(slug)
    row = await conn.fetchrow(f"SELECT * FROM {table} WHERE type_id = $1", type_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return LookupOut(**dict(row))


@router.post("/{slug}", response_model=LookupOut, status_code=201)
async def create_lookup(slug: str, payload: LookupCreate, conn: Annotated[Connection, Depends(get_conn)], _: Annotated[UserOut, Depends(require_admin)]):
    table = _resolve(slug)
    row = await conn.fetchrow(
        f"INSERT INTO {table} (type_name, type_description) VALUES ($1,$2) RETURNING *",
        payload.type_name, payload.type_description,
    )
    return LookupOut(**dict(row))


@router.patch("/{slug}/{type_id}", response_model=LookupOut)
async def update_lookup(slug: str, type_id: UUID, payload: LookupUpdate, conn: Annotated[Connection, Depends(get_conn)], _: Annotated[UserOut, Depends(require_admin)]):
    table = _resolve(slug)
    if not await conn.fetchrow(f"SELECT 1 FROM {table} WHERE type_id = $1", type_id):
        raise HTTPException(status_code=404, detail="Not found")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return await get_lookup(slug, type_id, conn)

    set_clauses = ", ".join(f"{col} = ${i+2}" for i, col in enumerate(updates))
    await conn.execute(
        f"UPDATE {table} SET {set_clauses} WHERE type_id = $1",
        type_id, *updates.values(),
    )
    return await get_lookup(slug, type_id, conn)


@router.delete("/{slug}/{type_id}", status_code=204)
async def delete_lookup(slug: str, type_id: UUID, conn: Annotated[Connection, Depends(get_conn)], _: Annotated[UserOut, Depends(require_admin)]):
    table = _resolve(slug)
    if not await conn.fetchrow(f"SELECT 1 FROM {table} WHERE type_id = $1", type_id):
        raise HTTPException(status_code=404, detail="Not found")

    for ref_table, col, is_array in _REFS.get(table, []):
        if is_array:
            ref = await conn.fetchrow(
                f"SELECT 1 FROM {ref_table} WHERE $1 = ANY({col}) LIMIT 1", type_id
            )
        else:
            ref = await conn.fetchrow(
                f"SELECT 1 FROM {ref_table} WHERE {col} = $1 LIMIT 1", type_id
            )
        if ref:
            raise HTTPException(
                status_code=409,
                detail=f"Type is in use by {ref_table}.{col} and cannot be deleted",
            )

    await conn.execute(f"DELETE FROM {table} WHERE type_id = $1", type_id)
