"""GET /scanner/scans/recent and GET /scanner/scans/{id}/report."""
from __future__ import annotations

from collections import defaultdict
from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_conn
from routers.auth import UserOut, require_admin

router = APIRouter()

_SCAN_RETENTION = 10


class ScanListItem(BaseModel):
    scan_id: UUID
    scanned_at: str
    source_machine: str
    total_count: int


class RawScanReport(BaseModel):
    scan_id: UUID
    scanned_at: str
    results_by_status: dict[str, list[dict]]


@router.get("/scans/recent")
async def list_recent_scans(
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> list[ScanListItem]:
    rows = await conn.fetch(
        "SELECT scan_id, scanned_at, source_machine, total_count "
        "FROM plugin_scans ORDER BY scanned_at DESC LIMIT $1",
        _SCAN_RETENTION,
    )
    return [
        ScanListItem(
            scan_id=r["scan_id"],
            scanned_at=r["scanned_at"].isoformat(),
            source_machine=r["source_machine"],
            total_count=r["total_count"],
        )
        for r in rows
    ]


@router.get(
    "/scans/{scan_id}/report",
    responses={404: {"description": "Scan not found"}},
)
async def get_scan_report(
    scan_id: UUID,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> RawScanReport:
    scan = await conn.fetchrow(
        "SELECT scan_id, scanned_at, source_machine FROM plugin_scans WHERE scan_id = $1",
        scan_id,
    )
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    results = await conn.fetch(
        "SELECT result_id, name, vendor, version, format, path, status, "
        "confidence, score, record_id, record_table, confirmed_at "
        "FROM plugin_scan_results WHERE scan_id = $1",
        scan_id,
    )

    by_status: dict[str, list[dict]] = defaultdict(list)
    for r in results:
        by_status[r["status"]].append({
            "result_id": str(r["result_id"]),
            "name": r["name"],
            "vendor": r["vendor"],
            "version": r["version"],
            "format": r["format"],
            "path": r["path"],
            "status": r["status"],
            "confidence": r["confidence"],
        })

    return RawScanReport(
        scan_id=scan["scan_id"],
        scanned_at=scan["scanned_at"].isoformat(),
        results_by_status=dict(by_status),
    )
