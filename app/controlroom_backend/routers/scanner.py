"""Plugin Scanner — core routes.

  POST /scanner/scan                     — ingest raw scan (API key auth)
  GET  /scanner/report[?scan_id=]        — scan report (latest or specific run)
  POST /scanner/confirm                  — apply user decisions
  PATCH /scanner/results/{id}/dismiss    — dismiss an orphaned result
  PATCH /scanner/results/{result_id}/keep — permanently keep a confirmed link
"""
from __future__ import annotations

from typing import Annotated, Any, Mapping
from uuid import UUID

import bcrypt
from asyncpg import Connection
from fastapi import APIRouter, Depends, Header, HTTPException, Response, status

from database import get_conn
from routers.auth import UserOut, get_current_user, require_admin
from routers.scanner_actions import apply_confirmation, insert_orphans
from routers.scanner_match import (
    CATALOG_TABLES,
    CatalogRecord,
    build_catalog_index,
    fetch_match_meta,
    load_exclusions,
    load_persistent_links,
    match_plugin,
)
from schemas.scanner import (
    AbsentRecord, CatalogSearchResult, ConfirmPayload, ConfirmResult,
    ScanPayload, ScanReport, ScanResult, ScanSummary,
    ScannedPlugin, build_scan_result,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# API key auth dependency
# ---------------------------------------------------------------------------

def _is_bearer_token(authorization: str | None) -> bool:
    return bool(authorization and authorization.startswith("Bearer "))


async def get_scanner_auth(
    conn: Annotated[Connection, Depends(get_conn)],
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if not _is_bearer_token(authorization):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    token = authorization.removeprefix("Bearer ").strip()
    rows = await conn.fetch(
        "SELECT label, hashed_key FROM scanner_api_keys WHERE revoked_at IS NULL"
    )
    for row in rows:
        if bcrypt.checkpw(token.encode(), row["hashed_key"].encode()):
            return row["label"]
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked API key")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _assign_status(confidence: str, disk_ver: str, record_ver: str | None, disk_paths: list | None = None) -> str:
    if confidence == "none":
        return "untracked"
    if confidence == "exact":
        if disk_ver != (record_ver or ""):
            return "conflicted"
        return "known" if disk_paths else "matched"
    return "unconfirmed"


async def _linked_plugin_row(
    conn: Connection, scan_id: UUID, p: ScannedPlugin, link: tuple[str, str],
) -> tuple | None:
    record_id, table = link
    if table not in CATALOG_TABLES:
        raise ValueError(f"persistent link has unknown record_table: {table!r}")
    pk, _ = CATALOG_TABLES[table]
    rec = await conn.fetchrow(f"SELECT version, disk_paths FROM {table} WHERE {pk}=$1", UUID(record_id))
    if rec is None:
        return None
    st = _assign_status("exact", p.version, rec["version"], rec["disk_paths"])
    return (scan_id, p.name, p.vendor, p.version, p.format, p.path,
            st, "exact", None, UUID(record_id), table, p.metadata_source)


def _unlinked_plugin_row(
    scan_id: UUID, p: ScannedPlugin,
    index: list[CatalogRecord], exclusions: set[str],
) -> tuple:
    _, result = match_plugin(p.name, p.vendor, index, exclusions)
    st = _assign_status(result.confidence, p.version,
                        result.record.version if result.record else None,
                        result.record.disk_paths if result.record else None)
    rec_id = UUID(result.record.record_id) if result.record else None
    rec_table = result.record.record_table if result.record else None
    return (scan_id, p.name, p.vendor, p.version, p.format, p.path,
            st, result.confidence, result.score, rec_id, rec_table, p.metadata_source)


# ---------------------------------------------------------------------------
# POST /scan
# ---------------------------------------------------------------------------

@router.post("/scan")
async def ingest_scan(
    payload: ScanPayload,
    _label: Annotated[str, Depends(get_scanner_auth)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> ScanSummary:
    index = await build_catalog_index(conn)
    exclusions = await load_exclusions(conn)
    links = await load_persistent_links(conn)

    async with conn.transaction():
        scan_id = await conn.fetchval(
            "INSERT INTO plugin_scans (source_machine, total_count) "
            "VALUES ($1, $2) RETURNING scan_id",
            payload.source_machine, len(payload.plugins),
        )
        rows, seen = [], set()
        for p in payload.plugins:
            fp = f"{p.vendor} {p.name}".lower().strip()
            seen.add(fp)
            if fp in links:
                row = await _linked_plugin_row(conn, scan_id, p, links[fp])
                if row is not None:
                    rows.append(row)
            elif fp not in exclusions:
                rows.append(_unlinked_plugin_row(scan_id, p, index, exclusions))
        await conn.executemany(
            "INSERT INTO plugin_scan_results "
            "(scan_id,name,vendor,version,format,path,status,confidence,score,record_id,record_table,metadata_source)"
            " VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
            rows,
        )
        await insert_orphans(conn, scan_id, links, seen)

    counts = await conn.fetchrow(
        "SELECT "
        "COUNT(*) FILTER (WHERE status='known')                                 AS known,"
        "COUNT(*) FILTER (WHERE status IN ('untracked','unlinked'))             AS unlinked,"
        "COUNT(*) FILTER (WHERE status='orphaned')                              AS orphaned,"
        "COUNT(*) FILTER (WHERE status IN ('matched','unconfirmed','conflicted','needs_review')) AS needs_review,"
        "COUNT(*) FILTER (WHERE status IN ('ignored','excluded'))               AS excluded "
        "FROM plugin_scan_results WHERE scan_id=$1", scan_id,
    )
    return ScanSummary(scan_id=scan_id, **dict(counts))


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
        f"SELECT * FROM ({_ABSENT_UNION}) c "
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


_ABSENT_UNION = " UNION ALL ".join(
    f"SELECT {pk}::text AS record_id, '{tbl}' AS record_table, "
    f"{name} AS name, b.brand_name AS vendor, t.version, t.disk_paths "
    f"FROM {tbl} t LEFT JOIN brands b ON t.brand_id = b.brand_id "
    f"WHERE t.deleted_at IS NULL AND t.disk_paths != '[]'::jsonb"
    for tbl, (pk, name) in CATALOG_TABLES.items()
)


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

_CATALOG_SEARCH_UNION = " UNION ALL ".join(
    f"SELECT {pk}::text AS record_id, '{tbl}' AS record_table, "
    f"{name} AS name, b.brand_name AS vendor, t.version "
    f"FROM {tbl} t LEFT JOIN brands b ON t.brand_id = b.brand_id "
    f"WHERE t.deleted_at IS NULL"
    for tbl, (pk, name) in CATALOG_TABLES.items()
)


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
            f"SELECT * FROM ({_CATALOG_SEARCH_UNION}) u "
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
