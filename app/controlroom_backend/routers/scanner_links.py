"""Find Link candidates, single link creation, and bulk link creation."""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, Query, status

from database import get_conn
from routers.auth import UserOut, require_admin
from routers.scanner_match import CATALOG_TABLES
from schemas.scanner_workbench import (
    BulkCreateLinkRequest,
    BulkLinkResult,
    CreateLinkRequest,
    FindLinkCandidatesResponse,
    OrphanedRecord,
)

router = APIRouter()

_ORPHANED_QUERY = " UNION ALL ".join(
    f"SELECT {pk}::text AS record_id, '{tbl}' AS record_table, "
    f"{name} AS name, b.brand_name AS vendor, t.version, t.disk_paths "
    f"FROM {tbl} t LEFT JOIN brands b ON t.brand_id = b.brand_id "
    f"WHERE t.deleted_at IS NULL AND jsonb_array_length(t.disk_paths) > 0"
    for tbl, (pk, name) in CATALOG_TABLES.items()
)


async def _optimistic_purge(conn: Connection, fingerprint: str, record_id: UUID) -> None:
    """Delete rejection for this (fingerprint, record_id) pairing if it exists."""
    await conn.execute(
        "DELETE FROM scanner_rejections WHERE fingerprint=$1 AND record_id=$2",
        fingerprint, record_id,
    )


async def _create_link_for_result(
    conn: Connection,
    result_id: UUID,
    catalog_record_id: UUID,
    username: str,
) -> None:
    """Write a vendor+name rule pairing the disk fingerprint to the catalog record."""
    row = await conn.fetchrow(
        "SELECT name, vendor FROM plugin_scan_results WHERE result_id=$1", result_id
    )
    if not row:
        return
    disk_name = row["name"].lower()
    disk_vendor = row["vendor"].lower()
    fp = f"{row['vendor']} {row['name']}".lower().strip()

    await conn.execute(
        "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) "
        "VALUES ($1, $2, $3) ON CONFLICT (disk_vendor) DO NOTHING",
        disk_vendor, row["vendor"], username,
    )
    await conn.execute(
        "INSERT INTO scanner_name_rules (disk_name, catalog_name, created_by) "
        "VALUES ($1, $2, $3) ON CONFLICT (disk_name) DO NOTHING",
        disk_name, row["name"], username,
    )
    await _optimistic_purge(conn, fp, catalog_record_id)


async def _candidates_for_unlinked(
    conn: Connection, q_lower: str | None
) -> FindLinkCandidatesResponse:
    """Return orphaned catalog records as candidates for an unlinked scan result."""
    orphaned_rows = await conn.fetch(_ORPHANED_QUERY)
    candidates: list[OrphanedRecord] = []
    for r in orphaned_rows:
        if q_lower and q_lower not in (r["name"] or "").lower():
            continue
        candidates.append(
            OrphanedRecord(
                catalog_record_id=UUID(r["record_id"]),
                catalog_record_table=r["record_table"],
                name=r["name"] or "",
                vendor=r["vendor"],
                version=r["version"],
                disk_paths=r["disk_paths"] or [],
            )
        )
    return FindLinkCandidatesResponse(type="unlinked", candidates=candidates, total=len(candidates))


async def _candidates_for_orphaned(
    conn: Connection, q_lower: str | None
) -> FindLinkCandidatesResponse:
    """Return unlinked scan results as candidates for an orphaned catalog record."""
    scan_row = await conn.fetchrow(
        "SELECT scan_id FROM plugin_scans ORDER BY scanned_at DESC LIMIT 1"
    )
    if not scan_row:
        return FindLinkCandidatesResponse(type="orphaned", candidates=[], total=0)
    results = await conn.fetch(
        "SELECT result_id, name, vendor, version, format, path "
        "FROM plugin_scan_results "
        "WHERE scan_id=$1 AND status IN ('untracked','unlinked') AND confirmed_at IS NULL",
        scan_row["scan_id"],
    )
    candidates_wb: list[dict] = []
    for r in results:
        if q_lower and q_lower not in (r["name"] or "").lower():
            continue
        candidates_wb.append({
            "result_id": str(r["result_id"]),
            "disk_name": r["name"],
            "disk_vendor": r["vendor"],
            "disk_version": r["version"],
            "disk_format": r["format"],
            "disk_path": r["path"],
            "display_name": r["name"],
            "display_vendor": r["vendor"],
            "bucket": "unlinked",
        })
    return FindLinkCandidatesResponse(
        type="orphaned", candidates=candidates_wb, total=len(candidates_wb)
    )


@router.get("/links/candidates")
async def find_link_candidates(
    type: Annotated[str, Query(pattern="^(unlinked|orphaned)$")],
    source_id: Annotated[UUID, Query()],
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
    q: Annotated[str | None, Query()] = None,
) -> FindLinkCandidatesResponse:
    q_lower = q.lower() if q else None
    if type == "unlinked":
        return await _candidates_for_unlinked(conn, q_lower)
    return await _candidates_for_orphaned(conn, q_lower)


@router.post("/links", status_code=status.HTTP_201_CREATED)
async def create_link(
    body: CreateLinkRequest,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> BulkLinkResult:
    await _create_link_for_result(conn, body.result_id, body.catalog_record_id, user.username)
    return BulkLinkResult(links_created=1)


@router.post("/links/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_create_links(
    body: BulkCreateLinkRequest,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> BulkLinkResult:
    for result_id in body.result_ids:
        await _create_link_for_result(conn, result_id, body.catalog_record_id, user.username)
    return BulkLinkResult(links_created=len(body.result_ids))
