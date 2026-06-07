"""Integration tests for GET /scanner/scans/recent and GET /scanner/scans/{id}/report.

These cover the NEW scan list/report endpoints (U-02 rewrite).
The existing test_scanner_report.py covers the OLD /scanner/report endpoint — do not modify it.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from ._scanner_helpers import insert_scan


# ---------------------------------------------------------------------------
# GET /scanner/scans/recent
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scans_recent_returns_empty_list_when_no_scans(client, admin_headers):
    resp = await client.get(
        "/scanner/scans/recent",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_scans_recent_returns_scans_newest_first(client, conn, admin_headers):
    older = datetime(2020, 1, 1, tzinfo=timezone.utc)
    newer = datetime(2020, 1, 2, tzinfo=timezone.utc)
    scan_id_1, _ = await insert_scan(conn, scanned_at=older)
    scan_id_2, _ = await insert_scan(conn, scanned_at=newer)
    resp = await client.get(
        "/scanner/scans/recent",
        headers=admin_headers,
    )
    data = resp.json()
    assert len(data) >= 2
    # newest first — scan_id_2 was inserted last so it has a later scanned_at
    scan_ids = [d["scan_id"] for d in data]
    assert scan_ids.index(str(scan_id_2)) < scan_ids.index(str(scan_id_1))


@pytest.mark.asyncio
async def test_scans_recent_returns_at_most_10(client, conn, admin_headers):
    for _ in range(12):
        await insert_scan(conn)
    resp = await client.get(
        "/scanner/scans/recent",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()) <= 10


@pytest.mark.asyncio
async def test_scans_recent_requires_auth(client):
    resp = await client.get("/scanner/scans/recent")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_scans_recent_requires_admin(client, auth_headers):
    resp = await client.get(
        "/scanner/scans/recent",
        headers=auth_headers,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /scanner/scans/{id}/report
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scan_report_returns_raw_results_by_status(client, conn, admin_headers):
    scan_id, _ = await insert_scan(conn, status="untracked")
    resp = await client.get(
        f"/scanner/scans/{scan_id}/report",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["scan_id"] == str(scan_id)
    assert "results_by_status" in data
    # "untracked" old status remaps to new bucket "unlinked"
    assert len(data["results_by_status"].get("unlinked", [])) == 1


@pytest.mark.asyncio
async def test_scan_report_404_for_unknown_scan(client, admin_headers):
    resp = await client.get(
        f"/scanner/scans/{uuid4()}/report",
        headers=admin_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_scan_report_applies_no_rules(client, conn, admin_headers):
    """Report maps old status to new bucket vocabulary but does not re-run catalog rules."""
    scan_id, _ = await insert_scan(conn, status="untracked")
    # Add a vendor rule that would change classification if rules were re-applied
    await conn.execute(
        "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) "
        "VALUES ($1, $2, $3)", "acme audio", "Acme Corp", "admin",
    )
    resp = await client.get(
        f"/scanner/scans/{scan_id}/report",
        headers=admin_headers,
    )
    # "untracked" remapped to "unlinked" — catalog rules are NOT re-applied
    data = resp.json()
    assert "unlinked" in data["results_by_status"]
    assert "untracked" not in data["results_by_status"]


@pytest.mark.asyncio
async def test_scan_report_requires_auth(client, conn):
    scan_id, _ = await insert_scan(conn)
    resp = await client.get(f"/scanner/scans/{scan_id}/report")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_scan_report_requires_admin(client, conn, auth_headers):
    scan_id, _ = await insert_scan(conn)
    resp = await client.get(
        f"/scanner/scans/{scan_id}/report",
        headers=auth_headers,
    )
    assert resp.status_code == 403
