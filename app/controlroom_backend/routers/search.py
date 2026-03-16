"""
Global search — ILIKE across all major tables via their views.
GET /search?q=<query>
Returns: [{table, id, name, brand_name}]
"""
from fastapi import APIRouter, Depends, HTTPException
from asyncpg import Connection
from pydantic import BaseModel
from uuid import UUID
from typing import Optional

from database import get_conn

router = APIRouter()


class SearchResult(BaseModel):
    table: str
    id: UUID
    name: str
    brand_name: Optional[str] = None


_SOURCES = [
    # (table_label, view, id_col, name_col, has_brand)
    ("brands",            "brands_view",            "brand_id",            "brand_name",      False),
    ("models",            "models_view",            "model_id",            "model_name",      True),
    ("effects",           "effects_view",           "effect_id",           "effect_name",     True),
    ("instruments",       "instruments_view",       "instrument_id",       "instrument_name", True),
    ("libraries",         "libraries_view",         "library_id",          "library_name",    True),
    ("workstations",      "workstations_view",      "workstation_id",      "tool_name",       True),
    ("workflow_tools",    "workflow_tools_view",    "workflow_tool_id",    "tool_name",       True),
    ("measurement_tools", "measurement_tools_view", "measurement_tool_id", "tool_name",       True),
    ("reference_tools",   "reference_tools_view",   "reference_tool_id",  "tool_name",       True),
    ("composition_tools", "composition_tools_view", "composition_tool_id", "tool_name",       True),
    ("admin_tools",       "admin_tools_view",       "admin_tool_id",       "tool_name",       True),
]


@router.get("", response_model=list[SearchResult])
async def search(q: str, conn: Connection = Depends(get_conn)):
    if not q or len(q.strip()) < 2:
        raise HTTPException(status_code=422, detail="Query must be at least 2 characters")

    pattern = f"%{q.strip()}%"
    results = []

    for label, view, id_col, name_col, has_brand in _SOURCES:
        brand_select = "brand_name" if has_brand else "NULL::text AS brand_name"
        where = f"{name_col} ILIKE $1"
        if has_brand:
            where += " OR brand_name ILIKE $1"

        rows = await conn.fetch(
            f"SELECT {id_col} AS id, {name_col} AS name, {brand_select} "
            f"FROM {view} WHERE {where}",
            pattern,
        )
        for row in rows:
            results.append(SearchResult(table=label, **dict(row)))

    return results
