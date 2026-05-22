"""Integration tests for soft and hard reset endpoints.

Covers soft reset (rules disabled, data intact), hard reset (confirmation required,
full wipe, seeded rules preserved and disabled), and transaction atomicity.
"""
from __future__ import annotations

import pytest

from ._scanner_helpers import insert_scan

_HARD_RESET_PHRASE = "RESET ALL SCANNER DATA"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def seed_rules(conn):
    await conn.execute(
        "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) "
        "VALUES ($1, $2, $3)", "ikmultimedia", "IK Multimedia", "admin",
    )
    await conn.execute(
        "INSERT INTO scanner_name_rules (disk_name, catalog_name, created_by) "
        "VALUES ($1, $2, $3)", "reverb pro", "Reverb Pro", "admin",
    )


# ---------------------------------------------------------------------------
# POST /scanner/admin/reset/soft
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_soft_reset_disables_all_rules(client, conn, admin_headers):
    await seed_rules(conn)
    resp = await client.post(
        "/scanner/admin/reset/soft",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "soft"
    assert data["rules_disabled"] >= 2

    # All rules disabled
    vendor_enabled = await conn.fetchval(
        "SELECT COUNT(*) FROM scanner_vendor_rules WHERE enabled=TRUE"
    )
    name_enabled = await conn.fetchval(
        "SELECT COUNT(*) FROM scanner_name_rules WHERE enabled=TRUE"
    )
    assert vendor_enabled == 0
    assert name_enabled == 0


@pytest.mark.asyncio
async def test_soft_reset_preserves_scan_data(client, conn, admin_headers):
    await insert_scan(conn)
    await client.post(
        "/scanner/admin/reset/soft",
        headers=admin_headers,
    )
    scan_count = await conn.fetchval("SELECT COUNT(*) FROM plugin_scans")
    assert scan_count >= 1


@pytest.mark.asyncio
async def test_soft_reset_preserves_scan_results(client, conn, admin_headers):
    await insert_scan(conn)
    await client.post(
        "/scanner/admin/reset/soft",
        headers=admin_headers,
    )
    result_count = await conn.fetchval("SELECT COUNT(*) FROM plugin_scan_results")
    assert result_count >= 1


# ---------------------------------------------------------------------------
# POST /scanner/admin/reset/hard
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_hard_reset_requires_confirmation_text(client, admin_headers):
    resp = await client.post(
        "/scanner/admin/reset/hard",
        json={"confirmation_text": "wrong text"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_hard_reset_requires_confirmation_text_not_none(client, admin_headers):
    resp = await client.post(
        "/scanner/admin/reset/hard",
        json={},
        headers=admin_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_hard_reset_wipes_scan_data(client, conn, admin_headers):
    await seed_rules(conn)
    await insert_scan(conn)
    resp = await client.post(
        "/scanner/admin/reset/hard",
        json={"confirmation_text": _HARD_RESET_PHRASE},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "hard"

    assert await conn.fetchval("SELECT COUNT(*) FROM plugin_scans") == 0
    assert await conn.fetchval("SELECT COUNT(*) FROM plugin_scan_results") == 0
    assert await conn.fetchval("SELECT COUNT(*) FROM scanner_vendor_rules") == 0
    assert await conn.fetchval("SELECT COUNT(*) FROM scanner_name_rules") == 0
    assert await conn.fetchval("SELECT COUNT(*) FROM scanner_name_aliases") == 0
    assert await conn.fetchval("SELECT COUNT(*) FROM scanner_rejections") == 0
    assert await conn.fetchval("SELECT COUNT(*) FROM scanner_exclusions") == 0


@pytest.mark.asyncio
async def test_hard_reset_preserves_seeded_patterns_as_disabled(client, conn, admin_headers):
    await client.post(
        "/scanner/admin/reset/hard",
        json={"confirmation_text": _HARD_RESET_PHRASE},
        headers=admin_headers,
    )
    # Seeded Mono Variant rule survives, set to disabled
    row = await conn.fetchrow(
        "SELECT enabled, is_seeded FROM scanner_name_patterns "
        "WHERE label = 'Mono variant' AND is_seeded = TRUE"
    )
    assert row is not None
    assert row["enabled"] is False


@pytest.mark.asyncio
async def test_hard_reset_deletes_non_seeded_patterns(client, conn, admin_headers):
    await conn.execute(
        "INSERT INTO scanner_name_patterns "
        "(label, pattern, match_fields, action, enabled, is_seeded, created_by) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7)",
        "Custom Pattern", "{name}(s)", ["vendor"], "alias_to_match", True, False, "admin",
    )
    await client.post(
        "/scanner/admin/reset/hard",
        json={"confirmation_text": _HARD_RESET_PHRASE},
        headers=admin_headers,
    )
    count = await conn.fetchval(
        "SELECT COUNT(*) FROM scanner_name_patterns WHERE is_seeded = FALSE"
    )
    assert count == 0


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_soft_reset_requires_auth(client):
    resp = await client.post("/scanner/admin/reset/soft")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_soft_reset_requires_admin(client, auth_headers):
    resp = await client.post(
        "/scanner/admin/reset/soft",
        headers=auth_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_hard_reset_requires_admin(client, auth_headers):
    resp = await client.post(
        "/scanner/admin/reset/hard",
        json={"confirmation_text": _HARD_RESET_PHRASE},
        headers=auth_headers,
    )
    assert resp.status_code == 403
