"""Integration tests for acknowledge and force confirm actions."""
from __future__ import annotations

import pytest

from ._scanner_helpers import insert_scan


async def _insert_effect(conn) -> str:
    return str(await conn.fetchval(
        "INSERT INTO effects (effect_name) VALUES ($1) RETURNING effect_id",
        "Acknowledge Test Effect",
    ))


async def _insert_matched_result(conn, effect_id: str) -> tuple:
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", 1,
    )
    result_id = await conn.fetchval(
        "INSERT INTO plugin_scan_results "
        "(scan_id, name, vendor, version, format, path, status, "
        " confidence, score, record_id, record_table) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING result_id",
        scan_id, "Reverb Pro", "Acme Audio", "2.0", "vst3",
        "/Library/VST3/Reverb.vst3", "needs_review",
        "exact", 100.0, effect_id, "effects",
    )
    return scan_id, result_id


async def _post_acknowledge(client, result_id, headers):
    return await client.post(
        "/scanner/confirm",
        json={"confirmations": [{"result_id": str(result_id), "action": "acknowledge"}]},
        headers=headers,
    )


async def _post_confirm(client, result_id, headers):
    return await client.post(
        "/scanner/confirm",
        json={"confirmations": [{"result_id": str(result_id), "action": "confirm"}]},
        headers=headers,
    )


async def _post_force(client, result_id, effect_id, headers):
    return await client.post(
        "/scanner/confirm",
        json={"confirmations": [{
            "result_id": str(result_id),
            "action": "force",
            "target_id": effect_id,
            "target_table": "effects",
        }]},
        headers=headers,
    )


@pytest.mark.asyncio
async def test_acknowledge_sets_confirmed_at(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    _, result_id = await _insert_matched_result(conn, effect_id)

    resp = await _post_acknowledge(client, result_id, admin_headers)
    assert resp.status_code == 200
    row = await conn.fetchrow(
        "SELECT confirmed_at FROM plugin_scan_results WHERE result_id=$1", result_id
    )
    assert row["confirmed_at"] is not None


@pytest.mark.asyncio
async def test_acknowledge_does_not_change_status(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    _, result_id = await _insert_matched_result(conn, effect_id)

    resp = await _post_acknowledge(client, result_id, admin_headers)
    assert resp.status_code == 200
    row = await conn.fetchrow(
        "SELECT status FROM plugin_scan_results WHERE result_id=$1", result_id
    )
    assert row["status"] == "needs_review"  # U-08: acknowledge leaves ingest status untouched


@pytest.mark.asyncio
async def test_acknowledge_creates_persistent_link(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    _, result_id = await _insert_matched_result(conn, effect_id)

    await _post_acknowledge(client, result_id, admin_headers)
    link = await conn.fetchrow(
        "SELECT record_id::text, record_table FROM scanner_plugin_links "
        "WHERE fingerprint='acme audio reverb pro'"
    )
    assert link is not None
    assert link["record_id"] == effect_id
    assert link["record_table"] == "effects"


@pytest.mark.asyncio
async def test_bulk_acknowledge_sets_confirmed_at_for_all(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", 2,
    )
    ids = []
    for name in ("Plugin A", "Plugin B"):
        rid = await conn.fetchval(
            "INSERT INTO plugin_scan_results "
            "(scan_id, name, vendor, version, format, path, status, "
            " confidence, score, record_id, record_table) "
            "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING result_id",
            scan_id, name, "Acme Audio", "1.0", "vst3", f"/path/{name}.vst3",
            "known", "exact", 100.0, effect_id, "effects",
        )
        ids.append(str(rid))

    resp = await client.post(
        "/scanner/confirm",
        json={"confirmations": [{"result_id": rid, "action": "acknowledge"} for rid in ids]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    for rid in ids:
        row = await conn.fetchrow(
            "SELECT confirmed_at FROM plugin_scan_results WHERE result_id=$1::uuid", rid
        )
        assert row["confirmed_at"] is not None


@pytest.mark.asyncio
async def test_force_sets_status_known(client, conn, admin_headers):
    _, result_id = await insert_scan(conn, "unlinked")
    effect_id = await _insert_effect(conn)

    resp = await _post_force(client, result_id, effect_id, admin_headers)
    assert resp.status_code == 200
    row = await conn.fetchrow(
        "SELECT status, record_id::text, record_table FROM plugin_scan_results WHERE result_id=$1",
        result_id,
    )
    assert row["status"] == "known"  # U-08: force → known (was 'matched')
    assert row["record_id"] == effect_id
    assert row["record_table"] == "effects"


@pytest.mark.asyncio
async def test_force_creates_persistent_link(client, conn, admin_headers):
    _, result_id = await insert_scan(conn, "unlinked")
    effect_id = await _insert_effect(conn)

    await _post_force(client, result_id, effect_id, admin_headers)
    link = await conn.fetchrow(
        "SELECT record_id::text FROM scanner_plugin_links WHERE record_table='effects'"
    )
    assert link is not None
    assert link["record_id"] == effect_id


@pytest.mark.asyncio
async def test_confirm_sets_status_known(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    _, result_id = await _insert_matched_result(conn, effect_id)

    resp = await _post_confirm(client, result_id, admin_headers)
    assert resp.status_code == 200
    row = await conn.fetchrow(
        "SELECT status FROM plugin_scan_results WHERE result_id=$1", result_id
    )
    assert row["status"] == "known"  # U-08: confirm (accept match) → known (was 'matched')


@pytest.mark.asyncio
async def test_create_sets_status_known(client, conn, admin_headers):
    _, result_id = await insert_scan(conn, "unlinked")

    resp = await client.post(
        "/scanner/confirm",
        json={"confirmations": [{
            "result_id": str(result_id),
            "action": "create",
            "target_table": "effects",
        }]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    row = await conn.fetchrow(
        "SELECT status, record_table FROM plugin_scan_results WHERE result_id=$1", result_id
    )
    assert row["status"] == "known"  # U-08: create (new catalog record) → known (was 'matched')
    assert row["record_table"] == "effects"


@pytest.mark.asyncio
async def test_force_requires_target_id(client, conn, admin_headers):
    _, result_id = await insert_scan(conn, "unlinked")

    resp = await client.post(
        "/scanner/confirm",
        json={"confirmations": [{
            "result_id": str(result_id),
            "action": "force",
            "target_table": "effects",
        }]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["errors"][0]["error"] is not None


# ── acknowledge: disk_paths + audit ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_acknowledge_appends_disk_path_to_catalog_record(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    _, result_id = await _insert_matched_result(conn, effect_id)

    await _post_acknowledge(client, result_id, admin_headers)

    row = await conn.fetchrow(
        "SELECT disk_paths FROM effects WHERE effect_id=$1::uuid", effect_id
    )
    paths = row["disk_paths"] or []
    assert any(p["path"] == "/Library/VST3/Reverb.vst3" for p in paths), \
        f"expected scanned path in disk_paths, got {paths}"
    assert any(p["format"] == "vst3" for p in paths)
    assert any(p["version"] == "2.0" for p in paths)


@pytest.mark.asyncio
async def test_acknowledge_creates_audit_log_entry(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    _, result_id = await _insert_matched_result(conn, effect_id)

    await _post_acknowledge(client, result_id, admin_headers)

    audit = await conn.fetchrow(
        "SELECT operation, new_data FROM audit_log "
        "WHERE table_name='effects' AND record_id=$1::uuid "
        "ORDER BY performed_at DESC LIMIT 1",
        effect_id,
    )
    assert audit is not None, "expected an audit_log entry after acknowledge"
    assert audit["operation"] == "UPDATE"
    assert "disk_paths" in (audit["new_data"] or {})


@pytest.mark.asyncio
async def test_acknowledge_does_not_duplicate_existing_disk_path(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    _, result_id1 = await _insert_matched_result(conn, effect_id)
    _, result_id2 = await _insert_matched_result(conn, effect_id)

    await _post_acknowledge(client, result_id1, admin_headers)
    await _post_acknowledge(client, result_id2, admin_headers)

    row = await conn.fetchrow(
        "SELECT disk_paths FROM effects WHERE effect_id=$1::uuid", effect_id
    )
    matching = [p for p in (row["disk_paths"] or []) if p["path"] == "/Library/VST3/Reverb.vst3"]
    assert len(matching) == 1, f"path should appear exactly once, got {row['disk_paths']}"


@pytest.mark.asyncio
async def test_acknowledge_skips_disk_path_when_path_is_empty(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1,$2) RETURNING scan_id",
        "test-machine", 1,
    )
    result_id = await conn.fetchval(
        "INSERT INTO plugin_scan_results "
        "(scan_id, name, vendor, version, format, path, status, "
        " confidence, score, record_id, record_table) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING result_id",
        scan_id, "Reverb Pro", "Acme Audio", "2.0", "vst3",
        "", "known", "exact", 100.0, effect_id, "effects",
    )

    await _post_acknowledge(client, result_id, admin_headers)

    row = await conn.fetchrow(
        "SELECT disk_paths FROM effects WHERE effect_id=$1::uuid", effect_id
    )
    assert (row["disk_paths"] or []) == [], \
        "disk_paths should remain empty when scan path is empty"
