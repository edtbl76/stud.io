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
    """Insert a scan with a result in matched status linked to an effect."""
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
        "/Library/VST3/Reverb.vst3", "matched",
        "exact", 100.0, effect_id, "effects",
    )
    return scan_id, result_id


@pytest.mark.asyncio
async def test_acknowledge_sets_confirmed_at(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    _, result_id = await _insert_matched_result(conn, effect_id)

    resp = await client.post(
        "/scanner/confirm",
        json={"confirmations": [{"result_id": str(result_id), "action": "acknowledge"}]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    row = await conn.fetchrow(
        "SELECT confirmed_at FROM plugin_scan_results WHERE result_id=$1", result_id
    )
    assert row["confirmed_at"] is not None


@pytest.mark.asyncio
async def test_acknowledge_does_not_change_status(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    _, result_id = await _insert_matched_result(conn, effect_id)

    await client.post(
        "/scanner/confirm",
        json={"confirmations": [{"result_id": str(result_id), "action": "acknowledge"}]},
        headers=admin_headers,
    )
    row = await conn.fetchrow(
        "SELECT status FROM plugin_scan_results WHERE result_id=$1", result_id
    )
    assert row["status"] == "matched"


@pytest.mark.asyncio
async def test_acknowledge_creates_persistent_link(client, conn, admin_headers):
    effect_id = await _insert_effect(conn)
    _, result_id = await _insert_matched_result(conn, effect_id)

    await client.post(
        "/scanner/confirm",
        json={"confirmations": [{"result_id": str(result_id), "action": "acknowledge"}]},
        headers=admin_headers,
    )
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
            "matched", "exact", 100.0, effect_id, "effects",
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
async def test_force_sets_status_matched(client, conn, admin_headers):
    _, result_id = await insert_scan(conn, "untracked")
    effect_id = await _insert_effect(conn)

    resp = await client.post(
        "/scanner/confirm",
        json={"confirmations": [{
            "result_id": str(result_id),
            "action": "force",
            "target_id": effect_id,
            "target_table": "effects",
        }]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    row = await conn.fetchrow(
        "SELECT status, record_id::text, record_table FROM plugin_scan_results WHERE result_id=$1",
        result_id,
    )
    assert row["status"] == "matched"
    assert row["record_id"] == effect_id
    assert row["record_table"] == "effects"


@pytest.mark.asyncio
async def test_force_creates_persistent_link(client, conn, admin_headers):
    _, result_id = await insert_scan(conn, "untracked")
    effect_id = await _insert_effect(conn)

    await client.post(
        "/scanner/confirm",
        json={"confirmations": [{
            "result_id": str(result_id),
            "action": "force",
            "target_id": effect_id,
            "target_table": "effects",
        }]},
        headers=admin_headers,
    )
    link = await conn.fetchrow(
        "SELECT record_id::text FROM scanner_plugin_links WHERE record_table='effects'"
    )
    assert link is not None
    assert link["record_id"] == effect_id


@pytest.mark.asyncio
async def test_force_requires_target_id(client, conn, admin_headers):
    _, result_id = await insert_scan(conn, "untracked")

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
