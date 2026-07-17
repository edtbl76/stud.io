"""Plugin Scanner — catalog search, and result actions.

  GET   /scanner/catalog/search            — catalog search for manual linking
  PATCH /scanner/results/{id}/dismiss      — dismiss an orphaned result
  PATCH /scanner/results/{result_id}/keep  — permanently keep a confirmed link
  POST  /scanner/confirm                   — apply user decisions

Scan ingest (`POST /scanner/scan`) lives in `scanner_ingest`; the read-only Scan
Report lives in `scanner_report`; auth deps in `scanner_auth`.
"""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, Response

from database import get_conn
from routers.auth import UserOut, get_current_user, require_admin
from routers.scanner_actions import apply_confirmation
from routers.scanner_catalog import CATALOG_TABLES, catalog_search_query
from schemas.scanner import CatalogSearchResult, ConfirmPayload, ConfirmResult

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /catalog/search
# ---------------------------------------------------------------------------

@router.get("/catalog/search", responses={400: {"description": "Unknown table"}})
async def catalog_search(
    q: str,
    _user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[Connection, Depends(get_conn)],
    table: str | None = None,
) -> list[CatalogSearchResult]:
    pattern = f"%{q}%"
    if table and table not in CATALOG_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown table: {table!r}")
    if table:
        pk, name_col = CATALOG_TABLES[table]
        sql = (
            f"SELECT {pk}::text AS record_id, '{table}' AS record_table, "
            f"{name_col} AS name, b.brand_name AS vendor, t.version "
            f"FROM {table} t LEFT JOIN brands b ON t.brand_id = b.brand_id "
            f"WHERE t.deleted_at IS NULL "
            f"AND ({name_col} ILIKE $1 OR b.brand_name ILIKE $1) "
            f"ORDER BY {name_col} LIMIT 20"
        )
    else:
        sql = (
            f"SELECT * FROM ({catalog_search_query()}) u "
            f"WHERE (name ILIKE $1 OR vendor ILIKE $1) "
            f"ORDER BY name LIMIT 20"
        )
    rows = await conn.fetch(sql, pattern)
    return [CatalogSearchResult(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# PATCH /results/{result_id}/dismiss
# ---------------------------------------------------------------------------

async def _update_or_404(conn: Connection, sql: str, pk: UUID, detail: str) -> None:
    if not await conn.fetchval(sql, pk):
        raise HTTPException(status_code=404, detail=detail)


@router.patch("/results/{result_id}/dismiss", responses={404: {"description": "Scan result not found"}})
async def dismiss_result(
    result_id: UUID,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
    response: Response,
) -> None:
    await _update_or_404(
        conn,
        "UPDATE plugin_scan_results SET dismissed_at = NOW() WHERE result_id = $1 RETURNING result_id",
        result_id,
        "Scan result not found",
    )
    response.status_code = 204


# ---------------------------------------------------------------------------
# PATCH /results/{result_id}/keep
# ---------------------------------------------------------------------------

@router.patch("/results/{result_id}/keep", status_code=204, responses={404: {"description": "Scan result or link not found"}})
async def keep_result(
    result_id: UUID,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> None:
    row = await conn.fetchrow(
        "SELECT vendor, name FROM plugin_scan_results WHERE result_id = $1", result_id
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Scan result not found")
    fingerprint = f"{row['vendor']} {row['name']}".lower().strip()
    updated = await conn.fetchval(
        "UPDATE scanner_plugin_links SET keep_permanently = TRUE "
        "WHERE fingerprint = $1 AND keep_permanently = FALSE RETURNING link_id",
        fingerprint,
    )
    if updated is None:
        existing = await conn.fetchval(
            "SELECT link_id FROM scanner_plugin_links WHERE fingerprint = $1", fingerprint
        )
        if existing is None:
            raise HTTPException(status_code=404, detail="No confirmed link found for this result")


# ---------------------------------------------------------------------------
# POST /confirm
# ---------------------------------------------------------------------------

@router.post("/confirm")
async def confirm_results(
    payload: ConfirmPayload,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> ConfirmResult:
    applied, errors = 0, []
    for c in payload.confirmations:
        try:
            async with conn.transaction():
                await apply_confirmation(conn, c, user.username)
            applied += 1
        except ValueError as exc:
            errors.append({"result_id": str(c.result_id), "error": str(exc)})
    return ConfirmResult(applied=applied, errors=errors)
