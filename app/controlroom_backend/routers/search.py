"""
Global full-text search across all major tables using PostgreSQL FTS.
GET /search?q=<query>[&notes=true][&limit=N]
Returns: {results: list[SearchResult], total: int}
"""
from typing import Annotated, NamedTuple, Optional
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_conn

router = APIRouter()

MIN_QUERY_LEN = 2
DEFAULT_LIMIT = 100
MAX_LIMIT = 200


class SearchResult(BaseModel):
    table: str
    id: UUID
    name: str
    brand_name: Optional[str] = None
    rank: float


class SearchResponse(BaseModel):
    results: list[SearchResult]
    total: int


class _Source(NamedTuple):
    label: str
    view: str
    id_col: str
    name_col: str
    brand_col: Optional[str]
    notes_cols: tuple[str, ...]


_SOURCES: tuple[_Source, ...] = (
    _Source("brands",            "brands_view",            "brand_id",            "brand_name",      None,         ("description",)),
    _Source("models",            "models_view",            "model_id",            "model_name",      "brand_name", ("description", "recording_notes", "artist_reference")),
    _Source("effects",           "effects_view",           "effect_id",           "effect_name",     "brand_name", ("description", "workflow_notes", "recording_notes", "artist_reference")),
    _Source("instruments",       "instruments_view",       "instrument_id",       "instrument_name", "brand_name", ("description", "instrument_notes", "recording_notes")),
    _Source("libraries",         "libraries_view",         "library_id",          "library_name",    "brand_name", ("description", "instrument_notes", "recording_notes")),
    _Source("workstations",      "workstations_view",      "workstation_id",      "tool_name",       "brand_name", ("description", "workflow_notes")),
    _Source("workflow_tools",    "workflow_tools_view",    "workflow_tool_id",    "tool_name",       "brand_name", ("description", "workflow_notes")),
    _Source("measurement_tools", "measurement_tools_view", "measurement_tool_id", "tool_name",       "brand_name", ("description", "workflow_notes")),
    _Source("reference_tools",   "reference_tools_view",   "reference_tool_id",  "tool_name",       "brand_name", ("description", "workflow_notes")),
    _Source("composition_tools", "composition_tools_view", "composition_tool_id", "tool_name",       "brand_name", ("description", "workflow_notes")),
    _Source("admin_tools",       "admin_tools_view",       "admin_tool_id",       "tool_name",       "brand_name", ("description", "workflow_notes")),
)


def _vec_expr(src: _Source, include_notes: bool) -> str:
    core = [src.name_col]
    if src.brand_col:
        core.append(src.brand_col)
    extra = list(src.notes_cols) if include_notes else []
    return " || ' ' || ".join(f"coalesce({c}, '')" for c in core + extra)


def _branch_sql(src: _Source, include_notes: bool) -> str:
    brand_sel = src.brand_col if src.brand_col else "NULL::text"
    return (
        f"SELECT '{src.label}' AS table_label, "
        f"{src.id_col} AS id, {src.name_col} AS name, "
        f"{brand_sel} AS brand_name, "
        f"to_tsvector('english', {_vec_expr(src, include_notes)}) AS vec "
        f"FROM {src.view}"
    )


def _build_sql(include_notes: bool) -> str:
    union = " UNION ALL ".join(_branch_sql(s, include_notes) for s in _SOURCES)
    return (
        "SELECT table_label, id, name, brand_name, "
        "ts_rank(vec, q) AS rank, COUNT(*) OVER () AS total "
        f"FROM ({union}) docs, "
        "websearch_to_tsquery('english', $1) AS q "
        "WHERE vec @@ q ORDER BY rank DESC LIMIT $2"
    )


_SQL_CORE = _build_sql(include_notes=False)
_SQL_NOTES = _build_sql(include_notes=True)


@router.get(
    "",
    responses={422: {"description": "Query too short or missing"}},
)
async def search(
    q: str,
    conn: Annotated[Connection, Depends(get_conn)],
    notes: bool = False,
    limit: int = DEFAULT_LIMIT,
) -> SearchResponse:
    if not q or len(q.strip()) < MIN_QUERY_LEN:
        raise HTTPException(status_code=422, detail="Query must be at least 2 characters")
    clamped = min(limit, MAX_LIMIT)
    rows = await conn.fetch(_SQL_NOTES if notes else _SQL_CORE, q.strip(), clamped)
    total = int(rows[0]["total"]) if rows else 0
    results = [
        SearchResult(
            table=r["table_label"],
            id=r["id"],
            name=r["name"],
            brand_name=r["brand_name"],
            rank=float(r["rank"]),
        )
        for r in rows
    ]
    return SearchResponse(results=results, total=total)
