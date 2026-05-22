"""GET /scanner/workbench — rules-applied, bucket-classified scan view."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, Query

from database import get_conn
from routers.auth import UserOut, require_admin
from routers.scanner_match import (
    CATALOG_TABLES,
    MatchResult,
    build_catalog_index,
    load_exclusions,
    match_plugin,
)
from schemas.scanner_workbench import OrphanedRecord, WorkbenchResponse, WorkbenchRow

router = APIRouter()

_WORKBENCH_QUERY = """
SELECT
    psr.result_id,
    psr.name          AS disk_name,
    psr.vendor        AS disk_vendor,
    psr.version       AS disk_version,
    psr.format        AS disk_format,
    psr.path          AS disk_path,
    psr.record_id,
    psr.record_table,
    psr.confidence,
    psr.confirmed_at,
    psr.confirmed_by,
    COALESCE(vr.catalog_vendor, psr.vendor) AS display_vendor,
    COALESCE(nr.catalog_name,   psr.name)   AS display_name
FROM plugin_scan_results psr
LEFT JOIN scanner_vendor_rules vr
    ON lower(psr.vendor) = vr.disk_vendor AND vr.enabled = TRUE
LEFT JOIN scanner_name_rules nr
    ON lower(psr.name) = nr.disk_name AND nr.enabled = TRUE
WHERE psr.scan_id = $1
"""

_CATALOG_NAME_QUERY = " UNION ALL ".join(
    f"SELECT {pk}::text AS record_id, '{tbl}' AS record_table, "
    f"{name} AS record_name, b.brand_name AS record_vendor, t.version AS record_version, t.disk_paths "
    f"FROM {tbl} t LEFT JOIN brands b ON t.brand_id = b.brand_id WHERE t.deleted_at IS NULL"
    for tbl, (pk, name) in CATALOG_TABLES.items()
)

_BUCKET_ORDER = {"excluded": 0, "known": 1, "needs_review": 2, "unlinked": 3}


@dataclass
class _WorkbenchCtx:
    exclusions: set[str]
    catalog_index: object
    catalog_meta: dict[str, dict]
    rejections: set[tuple]


class _WorkbenchQuery:
    def __init__(
        self,
        scan_id: UUID | None = Query(None),
        bucket: str | None = Query(None),
        show_confirmed: bool = Query(False),
    ):
        self.scan_id = scan_id
        self.bucket = bucket
        self.show_confirmed = show_confirmed


async def _build_rejection_set(conn: Connection, fingerprints: list[str]) -> set[tuple]:
    if not fingerprints:
        return set()
    rows = await conn.fetch(
        "SELECT fingerprint, record_id::text FROM scanner_rejections WHERE fingerprint = ANY($1::text[])",
        fingerprints,
    )
    return {(r["fingerprint"], r["record_id"]) for r in rows}


async def _fetch_catalog_meta(conn: Connection) -> dict[str, dict]:
    rows = await conn.fetch(_CATALOG_NAME_QUERY)
    return {
        str(r["record_id"]): {
            "record_name": r["record_name"],
            "record_vendor": r["record_vendor"],
            "record_version": r["record_version"],
            "disk_paths": r["disk_paths"] or [],
        }
        for r in rows
    }


def _classify_bucket(fingerprint: str, confirmed_at, match: MatchResult, ctx: _WorkbenchCtx) -> str:
    if fingerprint in ctx.exclusions:
        return "excluded"
    if match.confidence == "none" or match.record is None:
        return "unlinked"
    if confirmed_at is not None and ctx.catalog_meta.get(match.record.record_id, {}).get("disk_paths"):
        return "known"
    return "needs_review"


async def _resolve_scan_id(conn: Connection, scan_id: UUID | None) -> UUID | None:
    if scan_id is not None:
        return scan_id
    row = await conn.fetchrow("SELECT scan_id FROM plugin_scans ORDER BY scanned_at DESC LIMIT 1")
    return row["scan_id"] if row else None


async def _fetch_orphaned(conn: Connection, scan_paths: set[str]) -> list[OrphanedRecord]:
    rows = await conn.fetch(_CATALOG_NAME_QUERY)
    result: list[OrphanedRecord] = []
    for r in rows:
        paths: list[dict] = r["disk_paths"] or []
        missing = [p for p in paths if p.get("path") not in scan_paths]
        if missing:
            result.append(OrphanedRecord(
                catalog_record_id=UUID(r["record_id"]),
                catalog_record_table=r["record_table"],
                name=r["record_name"] or "",
                vendor=r["record_vendor"],
                version=r["record_version"],
                disk_paths=missing,
            ))
    return result


def _build_workbench_row(r, ctx: _WorkbenchCtx) -> WorkbenchRow:
    display_vendor: str = r["display_vendor"]
    display_name: str = r["display_name"]
    fingerprint = f"{display_vendor} {display_name}".lower().strip()
    _, match = match_plugin(display_name, display_vendor, ctx.catalog_index, ctx.exclusions)
    if match.record is not None and (fingerprint, str(match.record.record_id)) in ctx.rejections:
        match = MatchResult("none", None, None)
    bucket = _classify_bucket(fingerprint, r["confirmed_at"], match, ctx)
    record_meta = ctx.catalog_meta.get(str(match.record.record_id)) if match.record else None
    return WorkbenchRow(
        result_id=r["result_id"],
        disk_name=r["disk_name"], disk_vendor=r["disk_vendor"],
        disk_version=r["disk_version"], disk_format=r["disk_format"], disk_path=r["disk_path"],
        display_name=display_name, display_vendor=display_vendor,
        catalog_record_id=UUID(match.record.record_id) if match.record else None,
        catalog_record_table=match.record.record_table if match.record else None,
        catalog_record_name=record_meta["record_name"] if record_meta else None,
        catalog_record_vendor=record_meta["record_vendor"] if record_meta else None,
        catalog_record_version=record_meta["record_version"] if record_meta else None,
        bucket=bucket,
        confidence=match.confidence if match.confidence != "none" else None,
        confirmed_at=r["confirmed_at"], confirmed_by=r["confirmed_by"],
    )


def _process_workbench_rows(raw_rows, ctx: _WorkbenchCtx, bucket_filter: str | None, show_confirmed: bool) -> list[WorkbenchRow]:
    rows: list[WorkbenchRow] = []
    for r in raw_rows:
        wb_row = _build_workbench_row(r, ctx)
        if bucket_filter is not None and wb_row.bucket != bucket_filter:
            continue
        if not show_confirmed and wb_row.bucket == "known":
            continue
        rows.append(wb_row)
    rows.sort(key=lambda row: (
        row.catalog_record_table or "zzz",
        row.catalog_record_name or row.display_name,
        _BUCKET_ORDER.get(row.bucket, 99),
    ))
    return rows


@router.get("/workbench")
async def get_workbench(
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
    q: Annotated[_WorkbenchQuery, Depends()],
) -> WorkbenchResponse:
    resolved_scan_id = await _resolve_scan_id(conn, q.scan_id)
    if resolved_scan_id is None:
        return WorkbenchResponse(rows=[], orphaned=[], scan_id=None)

    raw_rows = await conn.fetch(_WORKBENCH_QUERY, resolved_scan_id)
    fingerprints = [f"{r['display_vendor']} {r['display_name']}".lower().strip() for r in raw_rows]
    ctx = _WorkbenchCtx(
        exclusions=await load_exclusions(conn),
        catalog_index=await build_catalog_index(conn),
        catalog_meta=await _fetch_catalog_meta(conn),
        rejections=await _build_rejection_set(conn, fingerprints),
    )
    scan_paths = {r["disk_path"] for r in raw_rows}
    workbench_rows = _process_workbench_rows(raw_rows, ctx, q.bucket, q.show_confirmed)
    orphaned = await _fetch_orphaned(conn, scan_paths)
    orphaned.sort(key=lambda o: (o.catalog_record_table, o.name))
    return WorkbenchResponse(rows=workbench_rows, orphaned=orphaned, scan_id=resolved_scan_id)
