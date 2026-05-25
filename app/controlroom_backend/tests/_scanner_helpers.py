"""Shared DB helpers for scanner test modules."""
from __future__ import annotations

from datetime import datetime
from typing import Optional


async def insert_scan(conn, status: str = "untracked", scanned_at: Optional[datetime] = None) -> tuple:
    """Insert a plugin_scan + one plugin_scan_result; return (scan_id, result_id)."""
    if scanned_at is not None:
        scan_id = await conn.fetchval(
            "INSERT INTO plugin_scans (source_machine, total_count, scanned_at) VALUES ($1, $2, $3) RETURNING scan_id",
            "test-machine", 1, scanned_at,
        )
    else:
        scan_id = await conn.fetchval(
            "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1, $2) RETURNING scan_id",
            "test-machine", 1,
        )
    result_id = await conn.fetchval(
        "INSERT INTO plugin_scan_results "
        "(scan_id, name, vendor, version, format, path, status) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING result_id",
        scan_id, "Reverb Pro", "Acme Audio", "1.0.0", "vst3", "/path/reverb.vst3", status,
    )
    return scan_id, result_id


async def insert_scan_with_link(conn) -> tuple:
    """Insert an orphaned scan result for Acme Audio/Reverb Pro and a confirmed link."""
    scan_id, result_id = await insert_scan(conn, status="orphaned")
    await conn.execute(
        "UPDATE plugin_scan_results SET vendor='Acme Audio', name='Reverb Pro' WHERE result_id=$1",
        result_id,
    )
    link_id = await conn.fetchval(
        "INSERT INTO scanner_plugin_links "
        "(scanned_vendor, scanned_name, fingerprint, record_id, record_table, confirmed_by) "
        "VALUES ($1,$2,$3,$4,$5,$6) RETURNING link_id",
        "Acme Audio", "Reverb Pro", "acme audio reverb pro",
        "00000000-0000-0000-0000-000000000001", "effects", "admin",
    )
    return result_id, link_id
