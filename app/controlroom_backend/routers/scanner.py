"""Plugin Scanner — report, catalog search, and result actions.

  GET   /scanner/report[?scan_id=]         — scan report (latest or specific run)
  GET   /scanner/catalog/search            — catalog search for manual linking
  PATCH /scanner/results/{id}/dismiss      — dismiss an orphaned result
  PATCH /scanner/results/{result_id}/keep  — permanently keep a confirmed link
  POST  /scanner/confirm                   — apply user decisions

Scan ingest (`POST /scanner/scan`) lives in `scanner_ingest`; auth deps in `scanner_auth`.
"""
from __future__ import annotations

from typing import Annotated, Any, Mapping
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, Response

from database import get_conn
from routers.auth import UserOut, get_current_user, require_admin
from routers.scanner_actions import apply_confirmation
from routers.scanner_catalog import CATALOG_TABLES, absent_query, catalog_search_query
from routers.scanner_match import fetch_match_meta
from schemas.scanner import (
    AbsentRecord, CatalogSearchResult, ConfirmPayload, ConfirmResult,
    ScanReport, ScanResult, build_scan_result,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /report
# ---------------------------------------------------------------------------

async def _fetch_scan(conn: Connection, scan_id: UUID | None) -> Mapping[str, Any] | None:
    if scan_id is not None:
        return await conn.fetchrow(
            "SELECT scan_id, scanned_at FROM plugin_scans WHERE scan_id=$1", scan_id
        )
    return await conn.fetchrow(
        "SELECT scan_id, scanned_at FROM plugin_scans ORDER BY scanned_at DESC LIMIT 1"
    )


async def _fetch_absent_records(conn: Connection, scan_id: UUID) -> list[AbsentRecord]:
    rows = await conn.fetch(
        f"SELECT * FROM ({absent_query()}) c "
        f"WHERE c.record_id::uuid NOT IN ("
        f"  SELECT record_id FROM plugin_scan_results "
        f"  WHERE scan_id=$1 AND record_id IS NOT NULL "
        f"  AND status IN ('known','matched','conflicted')"
        f")",
        scan_id,
    )
    return [
        AbsentRecord(
            record_id=r["record_id"], record_table=r["record_table"],
            name=r["name"], vendor=r["vendor"], version=r["version"],
            disk_paths=r["disk_paths"] or [],
        )
        for r in rows
    ]


@router.get("/report", responses={404: {"description": "No scans found"}})
async def get_report(
    _user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[Connection, Depends(get_conn)],
    scan_id: UUID | None = None,
) -> ScanReport:
    scan = await _fetch_scan(conn, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="No scans found")

    results = await conn.fetch(
        "SELECT result_id,status,name,vendor,version,format,path,"
        "confidence,score,record_id,record_table,dismissed_at,confirmed_at "
        "FROM plugin_scan_results WHERE scan_id=$1 "
        "ORDER BY name, result_id",
        scan["scan_id"],
    )
    meta = await fetch_match_meta(conn, results)
    grouped: dict[str, list[ScanResult]] = {
        s: [] for s in ("known", "matched", "conflicted", "unconfirmed", "untracked", "orphaned", "ignored")
    }
    for r in results:
        if r["status"] in grouped:
            grouped[r["status"]].append(build_scan_result(r, meta))

    absent = await _fetch_absent_records(conn, scan["scan_id"])
    return ScanReport(scan_id=scan["scan_id"], scanned_at=scan["scanned_at"], absent=absent, **grouped)


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
