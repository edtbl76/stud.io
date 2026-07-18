"""Integration tests for GET /scanner/scans/{scan_id}/report."""
from __future__ import annotations

import uuid

import pytest

from ._scanner_helpers import insert_scan


# ---------------------------------------------------------------------------
# GET /scanner/scans/{scan_id}/report  (read-only per-scan report used by frontend)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scans_report_returns_results_sorted_by_name_then_format(client, conn, admin_headers):
    """Results within each bucket group must be sorted alphabetically by name then format."""
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1, $2) RETURNING scan_id",
        "test-machine", 3,
    )
    for name, fmt in [("Zebra Synth", "vst3"), ("Analog Lab", "au"), ("Zebra Synth", "au")]:
        await conn.execute(
            "INSERT INTO plugin_scan_results (scan_id, name, vendor, version, format, path, status) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7)",
            scan_id, name, "Acme", "1.0", fmt, f"/p/{name}.{fmt}", "unlinked",
        )
    r = await client.get(f"/scanner/scans/{scan_id}/report", headers=admin_headers)
    assert r.status_code == 200
    items = r.json()["results_by_status"]["unlinked"]
    names_formats = [(i["name"], i["format"]) for i in items]
    assert names_formats == sorted(names_formats, key=lambda x: (x[0].casefold(), x[1].casefold()))


@pytest.mark.asyncio
async def test_scans_report_reads_stored_status_directly(client, conn, admin_headers):
    """U-08: the report groups by the raw five-value status — no remap."""
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1, $2) RETURNING scan_id",
        "test-machine", 3,
    )
    for plugin_name, status in [("Alpha", "unlinked"), ("Beta", "known"), ("Gamma", "needs_review")]:
        await conn.execute(
            "INSERT INTO plugin_scan_results (scan_id, name, vendor, version, format, path, status) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7)",
            scan_id, plugin_name, "Vendor", "1.0", "vst3", f"/p/{plugin_name}.vst3", status,
        )
    r = await client.get(f"/scanner/scans/{scan_id}/report", headers=admin_headers)
    assert r.status_code == 200
    buckets = r.json()["results_by_status"]
    assert [i["name"] for i in buckets["unlinked"]] == ["Alpha"]
    assert [i["name"] for i in buckets["known"]] == ["Beta"]
    assert [i["name"] for i in buckets["needs_review"]] == ["Gamma"]


@pytest.mark.asyncio
async def test_scans_report_unknown_scan_id_returns_404(client, admin_headers):
    r = await client.get(f"/scanner/scans/{uuid.uuid4()}/report", headers=admin_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_scans_report_requires_auth(client, conn):
    scan_id, _ = await insert_scan(conn)
    r = await client.get(f"/scanner/scans/{scan_id}/report")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_legacy_report_route_removed(client, conn, auth_headers):
    # U-08: legacy GET /scanner/report is retired. With a scan present the old
    # route returned 200; the removed route returns 404.
    await insert_scan(conn, "unlinked")
    r = await client.get("/scanner/report", headers=auth_headers)
    assert r.status_code == 404
