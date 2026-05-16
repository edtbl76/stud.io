"""Integration tests for known/matched/conflicted report classification.

known    = matched DB status + catalog record has disk_paths
matched  = matched DB status + catalog record has no disk_paths
conflicted = conflicted DB status
"""
from __future__ import annotations

import pytest


async def _insert_effect(conn, disk_paths=None) -> str:
    """Insert an effect with disk_paths. Pass Python list directly — asyncpg encodes to JSONB."""
    effect_id = await conn.fetchval(
        "INSERT INTO effects (effect_name, disk_paths) VALUES ($1, $2) RETURNING effect_id",
        "Classification Test Effect",
        disk_paths if disk_paths is not None else [],
    )
    return str(effect_id)


async def _insert_matched_result(conn, scan_id, record_id: str, *, status: str = "matched") -> str:
    """Insert a scan result linked to a catalog record."""
    result_id = await conn.fetchval(
        "INSERT INTO plugin_scan_results "
        "(scan_id, name, vendor, version, format, path, status, "
        " confidence, score, record_id, record_table) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING result_id",
        scan_id, "Reverb Pro", "Acme Audio", "2.0", "vst3",
        "/Library/VST3/Reverb.vst3", status,
        "exact", 100.0, record_id, "effects",
    )
    return str(result_id)


@pytest.fixture
async def scan_id(conn):
    sid = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1, $2) RETURNING scan_id",
        "test-machine", 1,
    )
    return sid


@pytest.mark.asyncio
async def test_matched_with_disk_paths_goes_to_known(client, conn, auth_headers, scan_id):
    effect_id = await _insert_effect(conn, disk_paths=[
        {"path": "/Library/VST3/Reverb.vst3", "format": "vst3", "version": "2.0"}
    ])
    await _insert_matched_result(conn, scan_id, effect_id)

    resp = await client.get("/scanner/report", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["known"]) == 1
    assert len(data["matched"]) == 0
    assert data["known"][0]["name"] == "Reverb Pro"


@pytest.mark.asyncio
async def test_matched_without_disk_paths_goes_to_matched(client, conn, auth_headers, scan_id):
    effect_id = await _insert_effect(conn, disk_paths=[])
    await _insert_matched_result(conn, scan_id, effect_id)

    resp = await client.get("/scanner/report", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["matched"]) == 1
    assert len(data["known"]) == 0


@pytest.mark.asyncio
async def test_version_mismatch_goes_to_conflicted(client, conn, auth_headers, scan_id):
    effect_id = await _insert_effect(conn)
    await _insert_matched_result(conn, scan_id, effect_id, status="conflicted")

    resp = await client.get("/scanner/report", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["conflicted"]) == 1
    assert "version_mismatch" not in data


@pytest.mark.asyncio
async def test_catalog_disk_paths_populated_on_known_result(client, conn, auth_headers, scan_id):
    disk_path = {"path": "/Library/VST3/Reverb.vst3", "format": "vst3", "version": "2.0"}
    effect_id = await _insert_effect(conn, disk_paths=[disk_path])
    await _insert_matched_result(conn, scan_id, effect_id)

    resp = await client.get("/scanner/report", headers=auth_headers)
    assert resp.status_code == 200
    known_result = resp.json()["known"][0]
    assert known_result["match"]["catalog_disk_paths"] == [disk_path]


@pytest.mark.asyncio
async def test_catalog_disk_paths_empty_on_matched_result(client, conn, auth_headers, scan_id):
    effect_id = await _insert_effect(conn, disk_paths=[])
    await _insert_matched_result(conn, scan_id, effect_id)

    resp = await client.get("/scanner/report", headers=auth_headers)
    assert resp.status_code == 200
    matched_result = resp.json()["matched"][0]
    assert matched_result["match"]["catalog_disk_paths"] == []
