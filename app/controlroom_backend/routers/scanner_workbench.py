"""GET /scanner/workbench — rules-applied, bucket-classified scan view."""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, Query

from database import get_conn
from routers.auth import UserOut, require_admin
from routers.scanner_catalog import (
    CATALOG_TABLES,
    MatchingContext,
    build_matching_context,
    catalog_meta_query,
)
from routers.scanner_match import MatchResult, match_plugin
from routers._helpers import log_audit
from schemas.scanner_workbench import (
    BulkUpdateRequest,
    BulkUpdateResult,
    CollisionCopy,
    CollisionInfo,
    CollisionRecord,
    OrphanedRecord,
    WorkbenchResponse,
    WorkbenchRow,
)

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

_BUCKET_ORDER = {"excluded": 0, "collision": 1, "known": 2, "needs_review": 3, "unlinked": 4}


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


def _classify_bucket(fingerprint: str, confirmed_at, match: MatchResult, ctx: MatchingContext) -> str:
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
    rows = await conn.fetch(catalog_meta_query())
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


def _build_workbench_row(r, ctx: MatchingContext) -> WorkbenchRow:
    display_vendor: str = r["display_vendor"]
    display_name: str = r["display_name"]
    fingerprint = f"{display_vendor} {display_name}".lower().strip()
    _, match = match_plugin(display_name, display_vendor, ctx.catalog_index, ctx.exclusions)
    if match.record is not None and (fingerprint, str(match.record.record_id)) in ctx.rejection_set:
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


def _workbench_sort_key(row: WorkbenchRow) -> tuple:
    return (row.catalog_record_table or "zzz", row.catalog_record_name or row.display_name, _BUCKET_ORDER.get(row.bucket, 99))


def _known_suppressed(wb_row: WorkbenchRow, show_confirmed: bool, bucket_filter: str | None) -> bool:
    return not show_confirmed and wb_row.bucket == "known" and bucket_filter != "known"


def _row_passes_filter(wb_row: WorkbenchRow, bucket_filter: str | None, show_confirmed: bool) -> bool:
    if bucket_filter is not None and wb_row.bucket != bucket_filter:
        return False
    return not _known_suppressed(wb_row, show_confirmed, bucket_filter)


def _collision_copy(row: WorkbenchRow) -> CollisionCopy:
    return CollisionCopy(
        result_id=row.result_id, path=row.disk_path,
        version=row.disk_version, format=row.disk_format,
    )


def _shared_record(row: WorkbenchRow) -> CollisionRecord:
    return CollisionRecord(
        id=row.catalog_record_id, table=row.catalog_record_table,
        name=row.catalog_record_name, vendor=row.catalog_record_vendor,
        version=row.catalog_record_version,
    )


def _apply_collisions(rows: list[WorkbenchRow]) -> list[WorkbenchRow]:
    """Cross-row pass: rows resolving to the same catalog record become a collision set."""
    groups: dict[tuple, list[WorkbenchRow]] = {}
    for row in rows:
        if row.catalog_record_id is None:
            continue  # unlinked rows are not catalog-anchored — never a collision
        key = (row.catalog_record_table, row.catalog_record_id, (row.disk_format or "").casefold())
        groups.setdefault(key, []).append(row)
    for members in groups.values():
        if len({m.disk_path for m in members}) < 2:
            continue
        info = CollisionInfo(
            shared_catalog_record=_shared_record(members[0]),
            copies=[_collision_copy(m) for m in members],
        )
        for member in members:
            member.bucket = "collision"
            member.collision = info
    return rows


def _process_workbench_rows(raw_rows, ctx: MatchingContext, bucket_filter: str | None, show_confirmed: bool) -> list[WorkbenchRow]:
    built = _apply_collisions([_build_workbench_row(r, ctx) for r in raw_rows])
    filtered = [r for r in built if _row_passes_filter(r, bucket_filter, show_confirmed)]
    filtered.sort(key=_workbench_sort_key)
    return filtered


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
    ctx = await build_matching_context(conn, with_meta=True, fingerprints=fingerprints)
    scan_paths = {r["disk_path"] for r in raw_rows}
    workbench_rows = _process_workbench_rows(raw_rows, ctx, q.bucket, q.show_confirmed)
    orphaned = await _fetch_orphaned(conn, scan_paths)
    orphaned.sort(key=lambda o: (o.catalog_record_table, o.name))
    return WorkbenchResponse(rows=workbench_rows, orphaned=orphaned, scan_id=resolved_scan_id)


def _build_update_targets(rows: list) -> dict[tuple, str]:
    """Group scan rows by (table, record_id); resolve version conflicts with max()."""
    targets: dict[tuple, str] = {}
    for r in rows:
        if r["record_table"] not in CATALOG_TABLES:
            continue
        key = (r["record_table"], r["record_id"])
        targets[key] = max(targets.get(key, ""), r["disk_version"])
    return targets


async def _write_version_updates(
    conn: Connection, targets: dict[tuple, str], username: str,
) -> int:
    updated = 0
    for (table, record_id), version in targets.items():
        pk, _ = CATALOG_TABLES[table]
        old = await conn.fetchrow(f"SELECT version FROM {table} WHERE {pk}=$1", record_id)  # noqa: S608 — pk/table from constants
        if old:
            await conn.execute(
                f"UPDATE {table} SET version=$1, updated_at=NOW() WHERE {pk}=$2",  # noqa: S608
                version, record_id,
            )
            await log_audit(conn, table, record_id, "UPDATE", username,
                            old_data=dict(old), new_data={"version": version})
            updated += 1
    return updated


@router.post("/workbench/bulk-update")
async def bulk_update_versions(
    body: BulkUpdateRequest,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> BulkUpdateResult:
    if not body.result_ids:
        return BulkUpdateResult(updated=0)
    rows = await conn.fetch(
        "SELECT result_id, version AS disk_version, record_id, record_table "
        "FROM plugin_scan_results WHERE result_id = ANY($1::uuid[]) "
        "AND record_id IS NOT NULL AND record_table IS NOT NULL",
        body.result_ids,
    )
    targets = _build_update_targets(rows)
    updated = await _write_version_updates(conn, targets, user.username)
    return BulkUpdateResult(updated=updated)
