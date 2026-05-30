"""Integration tests for GET /scanner/workbench."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def insert_effect(conn, name: str = "ZZZTESTPLUGIN_XYZ", disk_paths=None) -> uuid.UUID:
    record_id = await conn.fetchval(
        "INSERT INTO effects (effect_name) VALUES ($1) RETURNING effect_id", name
    )
    if disk_paths is not None:
        await conn.execute("UPDATE effects SET disk_paths=$1 WHERE effect_id=$2", disk_paths, record_id)
    return record_id


async def insert_result(conn, scan_id, status: str = "untracked") -> uuid.UUID:
    return await conn.fetchval(
        "INSERT INTO plugin_scan_results (scan_id, name, vendor, version, format, path, status) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING result_id",
        scan_id, "ZZZTESTPLUGIN_XYZ", "ZZZTESTVENDOR_XYZ", "1.0.0", "vst3", "/path/zzztest.vst3", status,
    )


async def insert_named_result(conn, scan_id, name: str, path: str) -> uuid.UUID:
    return await conn.fetchval(
        "INSERT INTO plugin_scan_results (scan_id, name, vendor, version, format, path, status) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING result_id",
        scan_id, name, "ZZZTESTVENDOR_XYZ", "1.0.0", "vst3", path, "untracked",
    )


async def insert_matched_result(conn, scan_id, record_id, record_table: str) -> uuid.UUID:
    return await conn.fetchval(
        "INSERT INTO plugin_scan_results "
        "(scan_id, name, vendor, version, format, path, status, record_id, record_table, confidence) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING result_id",
        scan_id, "ZZZTESTPLUGIN_XYZ", "ZZZTESTVENDOR_XYZ", "1.0.0", "vst3",
        "/path/zzztest.vst3", "matched", record_id, record_table, "exact",
    )


async def insert_confirmed_result(conn, scan_id, record_id, record_table: str) -> uuid.UUID:
    return await conn.fetchval(
        "INSERT INTO plugin_scan_results "
        "(scan_id, name, vendor, version, format, path, status, record_id, record_table, confidence, confirmed_at) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING result_id",
        scan_id, "ZZZTESTPLUGIN_XYZ", "ZZZTESTVENDOR_XYZ", "1.0.0", "vst3",
        "/path/zzztest.vst3", "matched", record_id, record_table, "exact",
        datetime.now(timezone.utc),
    )


async def insert_scan(conn) -> uuid.UUID:
    return await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", 1,
    )


async def _make_confirmed_scan(conn, disk_paths: list) -> tuple:
    """Insert an effect with disk_paths + a confirmed scan result. Returns (scan_id, record_id)."""
    record_id = await insert_effect(conn, disk_paths=disk_paths)
    scan_id = await insert_scan(conn)
    await insert_confirmed_result(conn, scan_id, record_id, "effects")
    return scan_id, record_id


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workbench_returns_rows_and_orphaned(client, conn, admin_headers):
    scan_id = await insert_scan(conn)
    await insert_result(conn, scan_id)
    resp = await client.get("/scanner/workbench", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "rows" in data and "orphaned" in data
    assert data["rows"][0]["bucket"] == "unlinked"


@pytest.mark.asyncio
async def test_workbench_uses_latest_scan_by_default(client, conn, admin_headers):
    scan_id_1 = await insert_scan(conn)
    await insert_result(conn, scan_id_1)
    # Use an explicit future scanned_at: within a transaction NOW() is constant,
    # so both inserts would otherwise share the same timestamp and the ORDER BY
    # would be non-deterministic.
    scan_id_2 = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count, scanned_at)"
        " VALUES ($1, $2, NOW() + interval '1 second') RETURNING scan_id",
        "test-machine", 0,
    )
    resp = await client.get("/scanner/workbench", headers=admin_headers)
    assert str(resp.json()["scan_id"]) == str(scan_id_2)


# ---------------------------------------------------------------------------
# Bucket classification
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workbench_untracked_result_is_unlinked(client, conn, admin_headers):
    scan_id = await insert_scan(conn)
    await insert_result(conn, scan_id)
    resp = await client.get("/scanner/workbench", headers=admin_headers)
    assert resp.json()["rows"][0]["bucket"] == "unlinked"


@pytest.mark.asyncio
async def test_workbench_matched_unconfirmed_is_needs_review(client, conn, admin_headers):
    record_id = await insert_effect(conn)
    scan_id = await insert_scan(conn)
    await insert_matched_result(conn, scan_id, record_id, "effects")
    resp = await client.get("/scanner/workbench", headers=admin_headers)
    assert resp.json()["rows"][0]["bucket"] == "needs_review"


@pytest.mark.asyncio
async def test_workbench_confirmed_with_disk_paths_is_known(client, conn, admin_headers):
    scan_id, _ = await _make_confirmed_scan(
        conn, [{"path": "/p/zzztest.vst3", "format": "vst3", "version": "1.0.0"}]
    )
    resp = await client.get("/scanner/workbench?show_confirmed=true", headers=admin_headers)
    assert any(r["bucket"] == "known" for r in resp.json()["rows"])


@pytest.mark.asyncio
async def test_workbench_confirmed_without_disk_paths_is_needs_review(client, conn, admin_headers):
    scan_id, _ = await _make_confirmed_scan(conn, [])
    resp = await client.get("/scanner/workbench", headers=admin_headers)
    assert resp.json()["rows"][0]["bucket"] == "needs_review"


@pytest.mark.asyncio
async def test_workbench_excluded_fingerprint_is_excluded(client, conn, admin_headers):
    scan_id = await insert_scan(conn)
    await insert_result(conn, scan_id)
    await conn.execute(
        "INSERT INTO scanner_exclusions (vendor, name) VALUES ($1,$2)",
        "ZZZTESTVENDOR_XYZ", "ZZZTESTPLUGIN_XYZ",
    )
    resp = await client.get("/scanner/workbench", headers=admin_headers)
    assert resp.json()["rows"][0]["bucket"] == "excluded"


# ---------------------------------------------------------------------------
# Rule normalization
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workbench_vendor_rule_changes_display_vendor(client, conn, admin_headers):
    scan_id = await insert_scan(conn)
    await conn.fetchval(
        "INSERT INTO plugin_scan_results (scan_id, name, vendor, version, format, path, status) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING result_id",
        scan_id, "ZZZTESTPLUGIN_XYZ", "ikmultimedia", "1.0.0", "vst3", "/p/z.vst3", "untracked",
    )
    await conn.execute(
        "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) VALUES ($1,$2,$3)",
        "ikmultimedia", "IK Multimedia", "admin",
    )
    row = (await client.get("/scanner/workbench", headers=admin_headers)).json()["rows"][0]
    assert row["disk_vendor"] == "ikmultimedia"
    assert row["display_vendor"] == "IK Multimedia"


@pytest.mark.asyncio
async def test_workbench_name_rule_changes_display_name(client, conn, admin_headers):
    scan_id = await insert_scan(conn)
    await conn.fetchval(
        "INSERT INTO plugin_scan_results (scan_id, name, vendor, version, format, path, status) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING result_id",
        scan_id, "bx_farts", "ZZZTESTVENDOR_XYZ", "1.0.0", "vst3", "/p/z.vst3", "untracked",
    )
    await conn.execute(
        "INSERT INTO scanner_name_rules (disk_name, catalog_name, created_by) VALUES ($1,$2,$3)",
        "bx_farts", "bx_farts", "admin",
    )
    row = (await client.get("/scanner/workbench", headers=admin_headers)).json()["rows"][0]
    assert row["disk_name"] == "bx_farts"
    assert row["display_name"] == "bx_farts"


# ---------------------------------------------------------------------------
# Rejection suppression
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workbench_rejected_pairing_produces_unlinked_bucket(client, conn, admin_headers):
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ($1) RETURNING brand_id", "ZZZTESTVENDOR_XYZ"
    )
    record_id = await conn.fetchval(
        "INSERT INTO effects (effect_name, brand_id) VALUES ($1,$2) RETURNING effect_id",
        "ZZZTESTPLUGIN_XYZ", brand_id,
    )
    scan_id = await insert_scan(conn)
    await insert_matched_result(conn, scan_id, record_id, "effects")
    fp = "zzztestvendor_xyz zzztestplugin_xyz"
    await conn.execute(
        "INSERT INTO scanner_rejections (fingerprint, record_id, record_table, confidence, rejected_by) "
        "VALUES ($1,$2,$3,$4,$5)",
        fp, record_id, "effects", "exact", "admin",
    )
    resp = await client.get("/scanner/workbench", headers=admin_headers)
    assert resp.json()["rows"][0]["bucket"] == "unlinked"


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workbench_bucket_filter(client, conn, admin_headers):
    scan_id = await insert_scan(conn)
    await insert_result(conn, scan_id)
    resp = await client.get("/scanner/workbench?bucket=unlinked", headers=admin_headers)
    assert resp.status_code == 200
    assert all(r["bucket"] == "unlinked" for r in resp.json()["rows"])


@pytest.mark.asyncio
async def test_workbench_show_confirmed_false_hides_confirmed(client, conn, admin_headers):
    await _make_confirmed_scan(conn, [{"path": "/p/reverb.vst3", "format": "vst3", "version": "1.0.0"}])
    resp = await client.get("/scanner/workbench?show_confirmed=false", headers=admin_headers)
    assert all(r["bucket"] != "known" for r in resp.json()["rows"])


@pytest.mark.asyncio
async def test_workbench_show_confirmed_true_includes_known(client, conn, admin_headers):
    await _make_confirmed_scan(conn, [{"path": "/p/reverb.vst3", "format": "vst3", "version": "1.0.0"}])
    resp = await client.get("/scanner/workbench?show_confirmed=true", headers=admin_headers)
    assert any(r["bucket"] == "known" for r in resp.json()["rows"])


# ---------------------------------------------------------------------------
# Orphaned records
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workbench_catalog_record_with_disk_paths_not_in_scan_is_orphaned(client, conn, admin_headers):
    await insert_effect(conn, disk_paths=[{"path": "/missing/plugin.vst3", "format": "vst3", "version": "1.0.0"}])
    scan_id = await insert_scan(conn)
    await insert_named_result(conn, scan_id, "Other Plugin", "/other/plugin.vst3")
    data = (await client.get("/scanner/workbench", headers=admin_headers)).json()
    assert len(data["orphaned"]) == 1


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workbench_requires_auth(client):
    assert (await client.get("/scanner/workbench")).status_code == 401


@pytest.mark.asyncio
async def test_workbench_requires_admin(client, auth_headers):
    assert (await client.get("/scanner/workbench", headers=auth_headers)).status_code == 403


# ---------------------------------------------------------------------------
# Step 8 — Gap 1: POST /scanner/workbench/bulk-update
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bulk_update_writes_disk_version_to_catalog(client, conn, admin_headers):
    record_id = await insert_effect(conn, "BulkUpdatePlugin")
    await conn.execute("UPDATE effects SET version='1.0' WHERE effect_id=$1", record_id)
    scan_id = await insert_scan(conn)
    result_id = await conn.fetchval(
        "INSERT INTO plugin_scan_results "
        "(scan_id, name, vendor, version, format, path, status, record_id, record_table, confidence) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING result_id",
        scan_id, "ZZZTESTPLUGIN_XYZ", "ZZZTESTVENDOR_XYZ", "2.0", "vst3",
        "/path/zzztest.vst3", "matched", record_id, "effects", "exact",
    )

    resp = await client.post(
        "/scanner/workbench/bulk-update",
        json={"result_ids": [str(result_id)]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 1

    new_version = await conn.fetchval("SELECT version FROM effects WHERE effect_id=$1", record_id)
    assert new_version == "2.0"


@pytest.mark.asyncio
async def test_bulk_update_two_results_same_target_counts_once(client, conn, admin_headers):
    """Two result_ids pointing at the same catalog record → updated == 1, not 2."""
    record_id = await insert_effect(conn, "BulkUpdateShared")
    await conn.execute("UPDATE effects SET version='1.0' WHERE effect_id=$1", record_id)
    scan_id = await insert_scan(conn)
    rid1 = await conn.fetchval(
        "INSERT INTO plugin_scan_results "
        "(scan_id, name, vendor, version, format, path, status, record_id, record_table, confidence) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING result_id",
        scan_id, "ZZZTESTPLUGIN_XYZ", "V1", "2.0", "vst3", "/p1.vst3", "matched", record_id, "effects", "exact",
    )
    rid2 = await conn.fetchval(
        "INSERT INTO plugin_scan_results "
        "(scan_id, name, vendor, version, format, path, status, record_id, record_table, confidence) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING result_id",
        scan_id, "ZZZTESTPLUGIN_XYZ", "V1", "2.1", "au", "/p1.au", "matched", record_id, "effects", "exact",
    )
    resp = await client.post(
        "/scanner/workbench/bulk-update",
        json={"result_ids": [str(rid1), str(rid2)]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 1

    new_version = await conn.fetchval("SELECT version FROM effects WHERE effect_id=$1", record_id)
    assert new_version == "2.1"  # max("2.0", "2.1") wins


@pytest.mark.asyncio
async def test_bulk_update_empty_result_ids_returns_zero(client, conn, admin_headers):
    resp = await client.post(
        "/scanner/workbench/bulk-update",
        json={"result_ids": []},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 0


@pytest.mark.asyncio
async def test_bulk_update_requires_auth(client):
    assert (await client.post("/scanner/workbench/bulk-update", json={"result_ids": []})).status_code == 401


@pytest.mark.asyncio
async def test_bulk_update_requires_admin(client, auth_headers):
    assert (await client.post("/scanner/workbench/bulk-update", json={"result_ids": []}, headers=auth_headers)).status_code == 403
