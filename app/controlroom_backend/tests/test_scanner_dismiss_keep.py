"""Integration tests for PATCH /scanner/results/{id}/dismiss and /keep."""
from __future__ import annotations

import uuid

import pytest

from ._scanner_helpers import insert_scan, insert_scan_with_link


# ---------------------------------------------------------------------------
# PATCH /scanner/results/{id}/dismiss
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_dismiss_result_sets_dismissed_at(client, admin_headers, conn):
    _, result_id = await insert_scan(conn, status="orphaned")
    r = await client.patch(f"/scanner/results/{result_id}/dismiss", headers=admin_headers)
    assert r.status_code == 204
    dismissed = await conn.fetchval(
        "SELECT dismissed_at FROM plugin_scan_results WHERE result_id=$1", result_id
    )
    assert dismissed is not None


@pytest.mark.asyncio
async def test_dismiss_result_unknown_returns_404(client, admin_headers):
    r = await client.patch(f"/scanner/results/{uuid.uuid4()}/dismiss", headers=admin_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_user_cannot_dismiss_result(client, auth_headers, conn):
    _, result_id = await insert_scan(conn, status="orphaned")
    r = await client.patch(f"/scanner/results/{result_id}/dismiss", headers=auth_headers)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_cannot_dismiss_result(client, conn):
    _, result_id = await insert_scan(conn, status="orphaned")
    r = await client.patch(f"/scanner/results/{result_id}/dismiss")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /scanner/results/{id}/keep
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_keep_result_sets_keep_permanently(client, admin_headers, conn):
    result_id, link_id = await insert_scan_with_link(conn)
    r = await client.patch(f"/scanner/results/{result_id}/keep", headers=admin_headers)
    assert r.status_code == 204
    kept = await conn.fetchval(
        "SELECT keep_permanently FROM scanner_plugin_links WHERE link_id=$1", link_id
    )
    assert kept is True


@pytest.mark.asyncio
async def test_keep_result_unknown_returns_404(client, admin_headers):
    r = await client.patch(f"/scanner/results/{uuid.uuid4()}/keep", headers=admin_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_keep_result_no_link_returns_404(client, admin_headers, conn):
    _, result_id = await insert_scan(conn, status="orphaned")
    r = await client.patch(f"/scanner/results/{result_id}/keep", headers=admin_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_user_cannot_keep_result(client, auth_headers, conn):
    result_id, _ = await insert_scan_with_link(conn)
    r = await client.patch(f"/scanner/results/{result_id}/keep", headers=auth_headers)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_cannot_keep_result(client, conn):
    result_id, _ = await insert_scan_with_link(conn)
    r = await client.patch(f"/scanner/results/{result_id}/keep")
    assert r.status_code == 401
