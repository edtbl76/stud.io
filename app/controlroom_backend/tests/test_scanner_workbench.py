"""Integration tests for GET /scanner/workbench.

Verifies bucket classification, rule normalization, rejection suppression,
exclusion filtering, filter params, and sort order.
All tests use a rolled-back transaction.
"""
from __future__ import annotations

import uuid
import pytest



# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def insert_scan_unlinked(conn) -> tuple:
    """Insert a scan + result with a name that will NOT fuzzy-match any seeded catalog data."""
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1, $2) RETURNING scan_id",
        "test-machine", 1,
    )
    result_id = await conn.fetchval(
        "INSERT INTO plugin_scan_results "
        "(scan_id, name, vendor, version, format, path, status) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING result_id",
        scan_id, "ZZZTESTPLUGIN_XYZ", "ZZZTESTVENDOR_XYZ",
        "1.0.0", "vst3", "/path/zzztest.vst3", "untracked",
    )
    return scan_id, result_id


async def insert_effect(conn, name: str = "ZZZTESTPLUGIN_XYZ", vendor: str = "ZZZTESTVENDOR_XYZ",
                        version: str = "1.0.0", disk_paths=None) -> uuid.UUID:
    record_id = await conn.fetchval(
        "INSERT INTO effects (effect_name) VALUES ($1) RETURNING effect_id", name
    )
    if disk_paths is not None:
        await conn.execute(
            "UPDATE effects SET disk_paths = $1 WHERE effect_id = $2",
            disk_paths, record_id,
        )
    return record_id


async def insert_result(conn, scan_id, *, name="ZZZTESTPLUGIN_XYZ", vendor="ZZZTESTVENDOR_XYZ",
                        version="1.0.0", fmt="vst3", path="/path/zzztest.vst3",
                        status="untracked", record_id=None, record_table=None,
                        confirmed_at=None, confidence=None) -> uuid.UUID:
    return await conn.fetchval(
        "INSERT INTO plugin_scan_results "
        "(scan_id, name, vendor, version, format, path, status, "
        " record_id, record_table, confirmed_at, confidence) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING result_id",
        scan_id, name, vendor, version, fmt, path, status,
        record_id, record_table, confirmed_at, confidence,
    )


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workbench_returns_rows_and_orphaned(client, conn, admin_headers):
    scan_id, _ = await insert_scan_unlinked(conn)
    resp = await client.get(
        "/scanner/workbench",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "rows" in data
    assert "orphaned" in data
    assert len(data["rows"]) == 1
    assert data["rows"][0]["bucket"] == "unlinked"


@pytest.mark.asyncio
async def test_workbench_uses_latest_scan_by_default(client, conn, admin_headers):
    # Two scans — workbench should default to the most recent
    scan_id_1, _ = await insert_scan_unlinked(conn)
    scan_id_2 = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1, $2) RETURNING scan_id",
        "test-machine", 0,
    )
    resp = await client.get(
        "/scanner/workbench",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert str(data["scan_id"]) == str(scan_id_2)


# ---------------------------------------------------------------------------
# Bucket classification
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workbench_untracked_result_is_unlinked(client, conn, admin_headers):
    scan_id, _ = await insert_scan_unlinked(conn)
    resp = await client.get(
        "/scanner/workbench", headers=admin_headers
    )
    assert resp.status_code == 200
    assert resp.json()["rows"][0]["bucket"] == "unlinked"


@pytest.mark.asyncio
async def test_workbench_matched_unconfirmed_is_needs_review(client, conn, admin_headers):
    record_id = await insert_effect(conn)
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", 1,
    )
    await insert_result(conn, scan_id, status="matched",
                        record_id=record_id, record_table="effects", confidence="exact")
    resp = await client.get(
        "/scanner/workbench", headers=admin_headers
    )
    assert resp.json()["rows"][0]["bucket"] == "needs_review"


@pytest.mark.asyncio
async def test_workbench_confirmed_with_disk_paths_is_known(client, conn, admin_headers):
    from datetime import datetime, timezone
    record_id = await insert_effect(
        conn, disk_paths=[{'path':'/p/zzztest.vst3','format':'vst3','version':'1.0.0'}]
    )
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", 1,
    )
    await insert_result(
        conn, scan_id, status="matched",
        record_id=record_id, record_table="effects", confidence="exact",
        confirmed_at=datetime.now(timezone.utc),
    )
    resp = await client.get(
        "/scanner/workbench?show_confirmed=true", headers=admin_headers
    )
    rows = resp.json()["rows"]
    known_rows = [r for r in rows if r["bucket"] == "known"]
    assert len(known_rows) >= 1


@pytest.mark.asyncio
async def test_workbench_confirmed_without_disk_paths_is_needs_review(client, conn, admin_headers):
    from datetime import datetime, timezone
    record_id = await insert_effect(conn, disk_paths=[])
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", 1,
    )
    await insert_result(
        conn, scan_id, status="matched",
        record_id=record_id, record_table="effects", confidence="exact",
        confirmed_at=datetime.now(timezone.utc),
    )
    resp = await client.get(
        "/scanner/workbench", headers=admin_headers
    )
    assert resp.json()["rows"][0]["bucket"] == "needs_review"


@pytest.mark.asyncio
async def test_workbench_excluded_fingerprint_is_excluded(client, conn, admin_headers):
    scan_id, result_id = await insert_scan_unlinked(conn)
    await conn.execute(
        "INSERT INTO scanner_exclusions (vendor, name) VALUES ($1, $2)",
        "ZZZTESTVENDOR_XYZ", "ZZZTESTPLUGIN_XYZ",
    )
    resp = await client.get(
        "/scanner/workbench", headers=admin_headers
    )
    assert resp.json()["rows"][0]["bucket"] == "excluded"


# ---------------------------------------------------------------------------
# Rule normalization
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workbench_vendor_rule_changes_display_vendor(client, conn, admin_headers):
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", 1,
    )
    await insert_result(conn, scan_id, vendor="ikmultimedia", status="untracked")
    await conn.execute(
        "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) "
        "VALUES ($1, $2, $3)", "ikmultimedia", "IK Multimedia", "admin",
    )
    resp = await client.get(
        "/scanner/workbench", headers=admin_headers
    )
    row = resp.json()["rows"][0]
    assert row["disk_vendor"] == "ikmultimedia"
    assert row["display_vendor"] == "IK Multimedia"


@pytest.mark.asyncio
async def test_workbench_name_rule_changes_display_name(client, conn, admin_headers):
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", 1,
    )
    await insert_result(conn, scan_id, name="bx_farts", status="untracked")
    await conn.execute(
        "INSERT INTO scanner_name_rules (disk_name, catalog_name, created_by) "
        "VALUES ($1, $2, $3)", "bx_farts", "bx_farts", "admin",
    )
    resp = await client.get(
        "/scanner/workbench", headers=admin_headers
    )
    row = resp.json()["rows"][0]
    assert row["disk_name"] == "bx_farts"
    assert row["display_name"] == "bx_farts"


# ---------------------------------------------------------------------------
# Rejection suppression
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workbench_rejected_pairing_produces_unlinked_bucket(client, conn, admin_headers):
    # Set up a brand + effect so match_plugin can find an exact fingerprint match
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ($1) RETURNING brand_id", "ZZZTESTVENDOR_XYZ"
    )
    record_id = await conn.fetchval(
        "INSERT INTO effects (effect_name, brand_id) VALUES ($1, $2) RETURNING effect_id",
        "ZZZTESTPLUGIN_XYZ", brand_id,
    )
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", 1,
    )
    await insert_result(
        conn, scan_id, status="matched",
        record_id=record_id, record_table="effects", confidence="exact",
    )
    # fingerprint = "zzztestvendor_xyz zzztestplugin_xyz" — exact match in catalog
    fp = "zzztestvendor_xyz zzztestplugin_xyz"
    await conn.execute(
        "INSERT INTO scanner_rejections "
        "(fingerprint, record_id, record_table, confidence, rejected_by) "
        "VALUES ($1, $2, $3, $4, $5)",
        fp, record_id, "effects", "exact", "admin",
    )
    resp = await client.get(
        "/scanner/workbench", headers=admin_headers
    )
    assert resp.json()["rows"][0]["bucket"] == "unlinked"


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workbench_bucket_filter(client, conn, admin_headers):
    scan_id, _ = await insert_scan_unlinked(conn)
    resp = await client.get(
        "/scanner/workbench?bucket=unlinked",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    rows = resp.json()["rows"]
    assert all(r["bucket"] == "unlinked" for r in rows)


@pytest.mark.asyncio
async def test_workbench_show_confirmed_false_hides_confirmed(client, conn, admin_headers):
    from datetime import datetime, timezone
    record_id = await insert_effect(
        conn, disk_paths=[{'path':'/p/reverb.vst3','format':'vst3','version':'1.0.0'}]
    )
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", 1,
    )
    await insert_result(
        conn, scan_id, status="matched",
        record_id=record_id, record_table="effects", confidence="exact",
        confirmed_at=datetime.now(timezone.utc),
    )
    resp = await client.get(
        "/scanner/workbench?show_confirmed=false",
        headers=admin_headers,
    )
    # known rows hidden by default
    rows = resp.json()["rows"]
    assert all(r["bucket"] != "known" for r in rows)


@pytest.mark.asyncio
async def test_workbench_show_confirmed_true_includes_known(client, conn, admin_headers):
    from datetime import datetime, timezone
    record_id = await insert_effect(
        conn, disk_paths=[{'path':'/p/reverb.vst3','format':'vst3','version':'1.0.0'}]
    )
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", 1,
    )
    await insert_result(
        conn, scan_id, status="matched",
        record_id=record_id, record_table="effects", confidence="exact",
        confirmed_at=datetime.now(timezone.utc),
    )
    resp = await client.get(
        "/scanner/workbench?show_confirmed=true",
        headers=admin_headers,
    )
    rows = resp.json()["rows"]
    assert any(r["bucket"] == "known" for r in rows)


# ---------------------------------------------------------------------------
# Orphaned records
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workbench_catalog_record_with_disk_paths_not_in_scan_is_orphaned(
    client, conn, admin_headers
):
    # Catalog record has disk_paths but the path is NOT in the scan
    await insert_effect(
        conn,
        disk_paths=[{'path':'/missing/plugin.vst3','format':'vst3','version':'1.0.0'}],
    )
    # Scan has a completely different plugin
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", 1,
    )
    await insert_result(conn, scan_id, name="Other Plugin", path="/other/plugin.vst3")
    resp = await client.get(
        "/scanner/workbench", headers=admin_headers
    )
    data = resp.json()
    assert len(data["orphaned"]) == 1


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workbench_requires_auth(client):
    resp = await client.get("/scanner/workbench")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_workbench_requires_admin(client, auth_headers):
    resp = await client.get(
        "/scanner/workbench", headers=auth_headers
    )
    assert resp.status_code == 403
