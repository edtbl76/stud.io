"""Integration tests for scanner link management endpoints.

Covers Find Link candidates (both directions), single/bulk link creation,
and optimistic rejection purge on link creation.
"""
from __future__ import annotations

from uuid import uuid4

import pytest

from ._scanner_helpers import insert_scan


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def insert_effect_with_disk_paths(conn, name="Reverb Pro", vendor="Acme Audio"):
    effect_id = await conn.fetchval(
        "INSERT INTO effects (effect_name) VALUES ($1) RETURNING effect_id", name
    )
    await conn.execute(
        "UPDATE effects SET disk_paths = $1 WHERE effect_id = $2",
        [{"path": "/missing/reverb.vst3", "format": "vst3", "version": "1.0.0"}],
        effect_id,
    )
    return effect_id


async def insert_effect(conn, name="Reverb Pro"):
    return await conn.fetchval(
        "INSERT INTO effects (effect_name) VALUES ($1) RETURNING effect_id", name
    )


# ---------------------------------------------------------------------------
# GET /scanner/links/candidates?type=unlinked
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_candidates_unlinked_returns_orphaned_records(client, conn, admin_headers):
    """From an Unlinked result, candidates are orphaned catalog records."""
    effect_id = await insert_effect_with_disk_paths(conn)
    scan_id, result_id = await insert_scan(conn, status="untracked")
    resp = await client.get(
        f"/scanner/links/candidates?type=unlinked&source_id={result_id}",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "unlinked"
    assert any(str(c["catalog_record_id"]) == str(effect_id)
               for c in data["candidates"])


@pytest.mark.asyncio
async def test_candidates_unlinked_q_filter(client, conn, admin_headers):
    await insert_effect_with_disk_paths(conn, name="Reverb Pro")
    await insert_effect_with_disk_paths(conn, name="Delay Machine")
    _, result_id = await insert_scan(conn, status="untracked")
    resp = await client.get(
        f"/scanner/links/candidates?type=unlinked&source_id={result_id}&q=reverb",
        headers=admin_headers,
    )
    candidates = resp.json()["candidates"]
    assert all("reverb" in c["name"].lower() for c in candidates)


# ---------------------------------------------------------------------------
# GET /scanner/links/candidates?type=orphaned
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_candidates_orphaned_returns_unlinked_results(client, conn, admin_headers):
    """From an Orphaned record, candidates are unlinked scan results."""
    effect_id = await insert_effect_with_disk_paths(conn)
    scan_id, result_id = await insert_scan(conn, status="untracked")
    resp = await client.get(
        f"/scanner/links/candidates?type=orphaned&source_id={effect_id}",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "orphaned"
    assert any(str(c["result_id"]) == str(result_id) for c in data["candidates"])


# ---------------------------------------------------------------------------
# POST /scanner/links (single)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_link_creates_vendor_name_rule(client, conn, admin_headers):
    _, result_id = await insert_scan(conn, status="untracked")
    effect_id = await insert_effect(conn)
    resp = await client.post(
        "/scanner/links",
        json={
            "result_id": str(result_id),
            "catalog_record_id": str(effect_id),
            "catalog_record_table": "effects",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "links_created" in data
    assert data["links_created"] == 1


@pytest.mark.asyncio
async def test_create_link_purges_matching_rejection(client, conn, admin_headers):
    """Optimistic purge: rejection for same fingerprint + record_id is deleted."""
    _, result_id = await insert_scan(conn, status="untracked")
    effect_id = await insert_effect(conn)
    fp = "acme audio reverb pro"
    await conn.execute(
        "INSERT INTO scanner_rejections "
        "(fingerprint, record_id, record_table, confidence, rejected_by) "
        "VALUES ($1, $2, $3, $4, $5)",
        fp, effect_id, "effects", "exact", "admin",
    )
    await client.post(
        "/scanner/links",
        json={
            "result_id": str(result_id),
            "catalog_record_id": str(effect_id),
            "catalog_record_table": "effects",
        },
        headers=admin_headers,
    )
    rejection = await conn.fetchrow(
        "SELECT 1 FROM scanner_rejections WHERE fingerprint=$1 AND record_id=$2",
        fp, effect_id,
    )
    assert rejection is None, "Rejection should have been purged after link creation"


# ---------------------------------------------------------------------------
# POST /scanner/links/bulk
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bulk_create_links(client, conn, admin_headers):
    _, result_id_1 = await insert_scan(conn, status="untracked")
    _, result_id_2 = await insert_scan(conn, status="untracked")
    effect_id = await insert_effect(conn)
    resp = await client.post(
        "/scanner/links/bulk",
        json={
            "result_ids": [str(result_id_1), str(result_id_2)],
            "catalog_record_id": str(effect_id),
            "catalog_record_table": "effects",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["links_created"] == 2


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_candidates_requires_auth(client):
    resp = await client.get(f"/scanner/links/candidates?type=unlinked&source_id={uuid4()}")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_link_requires_admin(client, auth_headers):
    resp = await client.post(
        "/scanner/links",
        json={"result_id": str(uuid4()), "catalog_record_id": str(uuid4()),
              "catalog_record_table": "effects"},
        headers=auth_headers,
    )
    assert resp.status_code == 403
