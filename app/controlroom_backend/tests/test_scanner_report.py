"""Integration tests for GET /scanner/report and scan_id filtering."""
from __future__ import annotations

import uuid

import pytest

from ._scanner_helpers import insert_scan


# ---------------------------------------------------------------------------
# GET /scanner/report
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_report_returns_grouped_results(client, conn, auth_headers):
    await insert_scan(conn, "untracked")
    response = await client.get("/scanner/report", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "untracked" in data and len(data["untracked"]) == 1
    assert data["untracked"][0]["name"] == "Reverb Pro"


@pytest.mark.asyncio
async def test_get_report_no_scan_returns_404(client, auth_headers):
    response = await client.get("/scanner/report", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_report_requires_auth(client):
    response = await client.get("/scanner/report")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /scanner/report?scan_id=
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_report_with_scan_id_returns_that_run(client, auth_headers, conn):
    scan_id, _ = await insert_scan(conn, status="untracked")
    r = await client.get(f"/scanner/report?scan_id={scan_id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["scan_id"] == str(scan_id)


@pytest.mark.asyncio
async def test_report_with_unknown_scan_id_returns_404(client, auth_headers):
    r = await client.get(f"/scanner/report?scan_id={uuid.uuid4()}", headers=auth_headers)
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# GET /scanner/scans/{scan_id}/report  (newer endpoint used by frontend)
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
            scan_id, name, "Acme", "1.0", fmt, f"/p/{name}.{fmt}", "untracked",
        )
    r = await client.get(f"/scanner/scans/{scan_id}/report", headers=admin_headers)
    assert r.status_code == 200
    # "untracked" old status remaps to new bucket "unlinked"
    items = r.json()["results_by_status"]["unlinked"]
    names_formats = [(i["name"], i["format"]) for i in items]
    assert names_formats == sorted(names_formats, key=lambda x: (x[0].casefold(), x[1].casefold()))


@pytest.mark.asyncio
async def test_scans_report_remaps_old_status_to_new_buckets(client, conn, admin_headers):
    """Old status values are remapped: untracked→unlinked, matched→known, conflicted→needs_review."""
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1, $2) RETURNING scan_id",
        "test-machine", 3,
    )
    for plugin_name, status in [("Alpha", "untracked"), ("Beta", "matched"), ("Gamma", "conflicted")]:
        await conn.execute(
            "INSERT INTO plugin_scan_results (scan_id, name, vendor, version, format, path, status) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7)",
            scan_id, plugin_name, "Vendor", "1.0", "vst3", f"/p/{plugin_name}.vst3", status,
        )
    r = await client.get(f"/scanner/scans/{scan_id}/report", headers=admin_headers)
    assert r.status_code == 200
    buckets = r.json()["results_by_status"]
    assert "unlinked" in buckets
    assert "untracked" not in buckets
    assert "known" in buckets
    assert "matched" not in buckets
    assert "needs_review" in buckets
    assert "conflicted" not in buckets


@pytest.mark.asyncio
async def test_scans_report_unknown_scan_id_returns_404(client, admin_headers):
    r = await client.get(f"/scanner/scans/{uuid.uuid4()}/report", headers=admin_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_scans_report_requires_auth(client, conn):
    scan_id, _ = await insert_scan(conn)
    r = await client.get(f"/scanner/scans/{scan_id}/report")
    assert r.status_code == 401
