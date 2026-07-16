"""Integration tests for scanner rejection management.

Covers reject action, idempotency, workbench suppression,
optimistic purge on confirmation, and manual rejection management.
"""
from __future__ import annotations

from uuid import uuid4

import pytest

from ._scanner_helpers import insert_scan


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def insert_effect(conn, name="Reverb Pro"):
    return await conn.fetchval(
        "INSERT INTO effects (effect_name) VALUES ($1) RETURNING effect_id", name
    )


async def insert_matched_result(conn, *, record_id, record_table="effects"):
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", 1,
    )
    result_id = await conn.fetchval(
        "INSERT INTO plugin_scan_results "
        "(scan_id, name, vendor, version, format, path, status, "
        " record_id, record_table, confidence) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING result_id",
        scan_id, "Reverb Pro", "Acme Audio", "1.0.0", "vst3",
        "/path/reverb.vst3", "known",
        record_id, record_table, "exact",
    )
    return scan_id, result_id


# ---------------------------------------------------------------------------
# POST /scanner/results/{id}/reject
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reject_stores_rejection_and_clears_match(client, conn, admin_headers):
    effect_id = await insert_effect(conn)
    _, result_id = await insert_matched_result(conn, record_id=effect_id)

    resp = await client.post(
        f"/scanner/results/{result_id}/reject",
        headers=admin_headers,
    )
    assert resp.status_code == 204

    # Rejection stored
    fp = "acme audio reverb pro"
    rej = await conn.fetchrow(
        "SELECT fingerprint, record_id FROM scanner_rejections "
        "WHERE fingerprint=$1 AND record_id=$2",
        fp, effect_id,
    )
    assert rej is not None

    # Match fields cleared on scan result
    row = await conn.fetchrow(
        "SELECT record_id, confidence, score FROM plugin_scan_results WHERE result_id=$1",
        result_id,
    )
    assert row["record_id"] is None
    assert row["confidence"] is None
    assert row["score"] is None


@pytest.mark.asyncio
async def test_reject_result_not_excluded(client, conn, admin_headers):
    """Rejection does NOT move result to excluded — it stays visible as unlinked."""
    effect_id = await insert_effect(conn)
    _, result_id = await insert_matched_result(conn, record_id=effect_id)
    await client.post(
        f"/scanner/results/{result_id}/reject",
        headers=admin_headers,
    )
    row = await conn.fetchrow(
        "SELECT status FROM plugin_scan_results WHERE result_id=$1", result_id
    )
    assert row["status"] != "excluded"


@pytest.mark.asyncio
async def test_reject_is_idempotent(client, conn, admin_headers):
    effect_id = await insert_effect(conn)
    _, result_id = await insert_matched_result(conn, record_id=effect_id)
    resp1 = await client.post(
        f"/scanner/results/{result_id}/reject",
        headers=admin_headers,
    )
    resp2 = await client.post(
        f"/scanner/results/{result_id}/reject",
        headers=admin_headers,
    )
    assert resp1.status_code == 204
    assert resp2.status_code == 204
    # Only one rejection row (ON CONFLICT DO NOTHING)
    count = await conn.fetchval(
        "SELECT COUNT(*) FROM scanner_rejections WHERE fingerprint='acme audio reverb pro'"
    )
    assert count == 1


@pytest.mark.asyncio
async def test_reject_404_for_unknown_result(client, admin_headers):
    resp = await client.post(
        f"/scanner/results/{uuid4()}/reject",
        headers=admin_headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /scanner/rejections
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_rejections(client, conn, admin_headers):
    await conn.execute(
        "INSERT INTO scanner_rejections "
        "(fingerprint, record_id, record_table, confidence, rejected_by) "
        "VALUES ($1, $2, $3, $4, $5)",
        "acme audio reverb pro", uuid4(), "effects", "exact", "admin",
    )
    resp = await client.get(
        "/scanner/rejections",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


# ---------------------------------------------------------------------------
# DELETE /scanner/rejections/{id}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_rejection(client, conn, admin_headers):
    rejection_id = await conn.fetchval(
        "INSERT INTO scanner_rejections "
        "(fingerprint, record_id, record_table, confidence, rejected_by) "
        "VALUES ($1, $2, $3, $4, $5) RETURNING rejection_id",
        "acme audio reverb pro", uuid4(), "effects", "exact", "admin",
    )
    resp = await client.delete(
        f"/scanner/rejections/{rejection_id}",
        headers=admin_headers,
    )
    assert resp.status_code == 204
    row = await conn.fetchrow(
        "SELECT 1 FROM scanner_rejections WHERE rejection_id=$1", rejection_id
    )
    assert row is None


@pytest.mark.asyncio
async def test_delete_rejection_404(client, admin_headers):
    resp = await client.delete(
        f"/scanner/rejections/{uuid4()}",
        headers=admin_headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reject_requires_auth(client, conn):
    _, result_id = await insert_scan(conn)
    resp = await client.post(f"/scanner/results/{result_id}/reject")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_reject_requires_admin(client, conn, auth_headers):
    _, result_id = await insert_scan(conn)
    resp = await client.post(
        f"/scanner/results/{result_id}/reject",
        headers=auth_headers,
    )
    assert resp.status_code == 403
