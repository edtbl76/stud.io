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
async def test_report_with_scan_id_returns_that_run(client, admin_headers, conn):
    scan_id, _ = await insert_scan(conn, status="untracked")
    r = await client.get(f"/scanner/report?scan_id={scan_id}", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["scan_id"] == str(scan_id)


@pytest.mark.asyncio
async def test_report_with_unknown_scan_id_returns_404(client, admin_headers):
    r = await client.get(f"/scanner/report?scan_id={uuid.uuid4()}", headers=admin_headers)
    assert r.status_code == 404
