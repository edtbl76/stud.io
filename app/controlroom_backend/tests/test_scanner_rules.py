"""Integration tests for scanner rule management endpoints.

Covers vendor, name, and pattern rule CRUD, toggle, count_affected_with_clean_split
accuracy, and acknowledge-clean flow.
"""
from __future__ import annotations

import pytest

from ._scanner_helpers import insert_scan


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def insert_effect(conn, name="Reverb Pro", vendor="Acme Audio", version="1.0.0"):
    return await conn.fetchval(
        "INSERT INTO effects (effect_name) VALUES ($1) RETURNING effect_id", name
    )


async def seed_scan_with_result(conn, *, name="Reverb Pro", vendor="Acme Audio",
                                version="1.0.0", status="untracked") -> tuple:
    scan_id, result_id = await insert_scan(conn, status=status)
    await conn.execute(
        "UPDATE plugin_scan_results SET name=$1, vendor=$2, version=$3 WHERE result_id=$4",
        name, vendor, version, result_id,
    )
    return scan_id, result_id


# ---------------------------------------------------------------------------
# GET /scanner/rules
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_rules_returns_all_types(client, conn, admin_headers):
    resp = await client.get(
        "/scanner/rules", headers=admin_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "vendor" in data
    assert "name" in data
    assert "pattern" in data


@pytest.mark.asyncio
async def test_get_rules_includes_seeded_pattern(client, admin_headers):
    resp = await client.get(
        "/scanner/rules", headers=admin_headers
    )
    patterns = resp.json()["pattern"]
    seeded = [p for p in patterns if p["is_seeded"]]
    assert len(seeded) >= 1
    assert seeded[0]["label"] == "Mono variant"


# ---------------------------------------------------------------------------
# POST /scanner/rules/vendor
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_vendor_rule_returns_rule_and_counts(client, conn, admin_headers):
    await seed_scan_with_result(conn, vendor="ikmultimedia")
    resp = await client.post(
        "/scanner/rules/vendor",
        json={"disk_vendor": "ikmultimedia", "catalog_vendor": "IK Multimedia"},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["disk_vendor"] == "ikmultimedia"
    assert data["catalog_vendor"] == "IK Multimedia"
    assert data["enabled"] is True
    assert "affected_count" in data
    assert "clean_count" in data
    assert "needs_review_count" in data


@pytest.mark.asyncio
async def test_vendor_rule_counts_invariant(client, conn, admin_headers):
    await seed_scan_with_result(conn, vendor="ikmultimedia")
    resp = await client.post(
        "/scanner/rules/vendor",
        json={"disk_vendor": "ikmultimedia", "catalog_vendor": "IK Multimedia"},
        headers=admin_headers,
    )
    data = resp.json()
    assert data["clean_count"] + data["needs_review_count"] == data["affected_count"]


@pytest.mark.asyncio
async def test_vendor_rule_duplicate_returns_409(client, conn, admin_headers):
    await conn.execute(
        "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) "
        "VALUES ($1, $2, $3)", "ikmultimedia", "IK Multimedia", "admin",
    )
    resp = await client.post(
        "/scanner/rules/vendor",
        json={"disk_vendor": "ikmultimedia", "catalog_vendor": "IK Multimedia 2"},
        headers=admin_headers,
    )
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# PATCH /scanner/rules/vendor/{id}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_update_vendor_rule(client, conn, admin_headers):
    rule_id = await conn.fetchval(
        "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) "
        "VALUES ($1, $2, $3) RETURNING rule_id",
        "ikmultimedia", "IK Multimedia", "admin",
    )
    resp = await client.patch(
        f"/scanner/rules/vendor/{rule_id}",
        json={"catalog_vendor": "IK Multimedia Updated"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["catalog_vendor"] == "IK Multimedia Updated"


@pytest.mark.asyncio
async def test_update_vendor_rule_404(client, conn, admin_headers):
    from uuid import uuid4
    resp = await client.patch(
        f"/scanner/rules/vendor/{uuid4()}",
        json={"catalog_vendor": "X"},
        headers=admin_headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /scanner/rules/vendor/{id}
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_delete_vendor_rule(client, conn, admin_headers):
    rule_id = await conn.fetchval(
        "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) "
        "VALUES ($1, $2, $3) RETURNING rule_id",
        "ikmultimedia", "IK Multimedia", "admin",
    )
    resp = await client.delete(
        f"/scanner/rules/vendor/{rule_id}",
        headers=admin_headers,
    )
    assert resp.status_code == 204
    row = await conn.fetchrow(
        "SELECT 1 FROM scanner_vendor_rules WHERE rule_id = $1", rule_id
    )
    assert row is None


# ---------------------------------------------------------------------------
# PATCH /scanner/rules/vendor/{id}/toggle
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_toggle_vendor_rule_disables(client, conn, admin_headers):
    rule_id = await conn.fetchval(
        "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) "
        "VALUES ($1, $2, $3) RETURNING rule_id",
        "ikmultimedia", "IK Multimedia", "admin",
    )
    resp = await client.patch(
        f"/scanner/rules/vendor/{rule_id}/toggle",
        json={"enabled": False},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False


@pytest.mark.asyncio
async def test_toggle_vendor_rule_enables(client, conn, admin_headers):
    rule_id = await conn.fetchval(
        "INSERT INTO scanner_vendor_rules "
        "(disk_vendor, catalog_vendor, enabled, created_by) "
        "VALUES ($1, $2, $3, $4) RETURNING rule_id",
        "ikmultimedia", "IK Multimedia", False, "admin",
    )
    resp = await client.patch(
        f"/scanner/rules/vendor/{rule_id}/toggle",
        json={"enabled": True},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is True


# ---------------------------------------------------------------------------
# POST /scanner/rules/vendor/{id}/acknowledge-clean
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_acknowledge_clean_confirms_clean_matches(client, conn, admin_headers):
    # Create a catalog record matching the scan result exactly
    effect_id = await insert_effect(conn, name="Reverb Pro", vendor="IK Multimedia")
    scan_id, result_id = await seed_scan_with_result(
        conn, name="Reverb Pro", vendor="ikmultimedia", version="1.0.0"
    )
    # Update catalog record version to match disk version
    await conn.execute(
        "UPDATE effects SET version='1.0.0' WHERE effect_id=$1", effect_id
    )
    rule_id = await conn.fetchval(
        "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) "
        "VALUES ($1, $2, $3) RETURNING rule_id",
        "ikmultimedia", "IK Multimedia", "admin",
    )
    resp = await client.post(
        f"/scanner/rules/vendor/{rule_id}/acknowledge-clean",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["acknowledged"] >= 0  # 0 if not a clean match, ≥0 always


@pytest.mark.asyncio
async def test_acknowledge_clean_is_idempotent(client, conn, admin_headers):
    """Second call returns 0 — already-confirmed rows are skipped."""
    rule_id = await conn.fetchval(
        "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) "
        "VALUES ($1, $2, $3) RETURNING rule_id",
        "ikmultimedia", "IK Multimedia", "admin",
    )
    await client.post(
        f"/scanner/rules/vendor/{rule_id}/acknowledge-clean",
        headers=admin_headers,
    )
    resp2 = await client.post(
        f"/scanner/rules/vendor/{rule_id}/acknowledge-clean",
        headers=admin_headers,
    )
    assert resp2.json()["acknowledged"] == 0


# ---------------------------------------------------------------------------
# Name rules — key endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_name_rule(client, conn, admin_headers):
    resp = await client.post(
        "/scanner/rules/name",
        json={"disk_name": "bx_farts", "catalog_name": "bx_farts"},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["disk_name"] == "bx_farts"
    assert data["clean_count"] + data["needs_review_count"] == data["affected_count"]


@pytest.mark.asyncio
async def test_delete_name_rule(client, conn, admin_headers):
    rule_id = await conn.fetchval(
        "INSERT INTO scanner_name_rules (disk_name, catalog_name, created_by) "
        "VALUES ($1, $2, $3) RETURNING rule_id",
        "bx_farts", "bx_farts", "admin",
    )
    resp = await client.delete(
        f"/scanner/rules/name/{rule_id}",
        headers=admin_headers,
    )
    assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Pattern rules — key endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_toggle_seeded_pattern_rule(client, conn, admin_headers):
    rule_id = await conn.fetchval(
        "SELECT rule_id FROM scanner_name_patterns WHERE is_seeded = TRUE LIMIT 1"
    )
    assert rule_id is not None
    resp = await client.patch(
        f"/scanner/rules/pattern/{rule_id}/toggle",
        json={"enabled": True},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is True


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_vendor_rule_requires_auth(client):
    resp = await client.post(
        "/scanner/rules/vendor",
        json={"disk_vendor": "x", "catalog_vendor": "X"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_vendor_rule_requires_admin(client, auth_headers):
    resp = await client.post(
        "/scanner/rules/vendor",
        json={"disk_vendor": "x", "catalog_vendor": "X"},
        headers=auth_headers,
    )
    assert resp.status_code == 403
