"""Plugin Scanner — core routes.

  POST /scanner/scan     — ingest raw scan (API key auth)
  GET  /scanner/report   — latest scan report
  POST /scanner/confirm  — apply user decisions
"""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

import bcrypt
from asyncpg import Connection
from fastapi import APIRouter, Depends, Header, HTTPException, status

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
    ConfirmPayload, ConfirmResult,
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

def _assign_status(confidence: str, disk_ver: str, record_ver: str | None) -> str:
    if confidence == "none":
        return "untracked"
    if confidence == "exact":
        return "matched" if disk_ver == (record_ver or "") else "version_mismatch"
    return "unconfirmed"


async def _linked_plugin_row(
    conn: Connection, scan_id: UUID, p: ScannedPlugin, link: tuple[str, str],
) -> tuple:
    record_id, table = link
    if table not in CATALOG_TABLES:
        raise ValueError(f"persistent link has unknown record_table: {table!r}")
    pk, _ = CATALOG_TABLES[table]
    rec = await conn.fetchrow(f"SELECT version FROM {table} WHERE {pk}=$1", UUID(record_id))
    rv = rec["version"] if rec else ""
    st = "matched" if p.version == rv else "version_mismatch"
    return (scan_id, p.name, p.vendor, p.version, p.format, p.path,
            st, "exact", None, UUID(record_id), table)


def _unlinked_plugin_row(
    scan_id: UUID, p: ScannedPlugin,
    index: list[CatalogRecord], exclusions: set[str],
) -> tuple:
    _, result = match_plugin(p.name, p.vendor, index, exclusions)
    st = _assign_status(result.confidence, p.version,
                        result.record.version if result.record else None)
    rec_id = UUID(result.record.record_id) if result.record else None
    rec_table = result.record.record_table if result.record else None
    return (scan_id, p.name, p.vendor, p.version, p.format, p.path,
            st, result.confidence, result.score, rec_id, rec_table)


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
                rows.append(await _linked_plugin_row(conn, scan_id, p, links[fp]))
            else:
                rows.append(_unlinked_plugin_row(scan_id, p, index, exclusions))
        await conn.executemany(
            "INSERT INTO plugin_scan_results "
            "(scan_id,name,vendor,version,format,path,status,confidence,score,record_id,record_table)"
            " VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
            rows,
        )
        await insert_orphans(conn, scan_id, links, seen)

    counts = await conn.fetchrow(
        "SELECT "
        "COUNT(*) FILTER (WHERE status='matched')          AS matched,"
        "COUNT(*) FILTER (WHERE status='version_mismatch') AS version_mismatch,"
        "COUNT(*) FILTER (WHERE status='unconfirmed')      AS unconfirmed,"
        "COUNT(*) FILTER (WHERE status='untracked')        AS untracked,"
        "COUNT(*) FILTER (WHERE status='orphaned')         AS orphaned "
        "FROM plugin_scan_results WHERE scan_id=$1", scan_id,
    )
    return ScanSummary(scan_id=scan_id, **dict(counts))


# ---------------------------------------------------------------------------
# GET /report
# ---------------------------------------------------------------------------

@router.get("/report", responses={404: {"description": "No scans found"}})
async def get_report(
    _user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> ScanReport:
    scan = await conn.fetchrow(
        "SELECT scan_id, scanned_at FROM plugin_scans ORDER BY scanned_at DESC LIMIT 1"
    )
    if not scan:
        raise HTTPException(status_code=404, detail="No scans found")

    results = await conn.fetch(
        "SELECT result_id,status,name,vendor,version,format,path,"
        "confidence,score,record_id,record_table "
        "FROM plugin_scan_results WHERE scan_id=$1",
        scan["scan_id"],
    )
    meta = await fetch_match_meta(conn, results)
    grouped: dict[str, list[ScanResult]] = {
        s: [] for s in ("matched", "version_mismatch", "unconfirmed", "untracked", "orphaned", "ignored")
    }
    for r in results:
        group = grouped.get(r["status"])
        if group is not None:
            group.append(build_scan_result(r, meta))
    return ScanReport(scan_id=scan["scan_id"], scanned_at=scan["scanned_at"], **grouped)


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
