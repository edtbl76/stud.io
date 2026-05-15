"""Integration tests for disk_paths JSONB field on catalog records.

Tests cover: effects, instruments, workflow_tools, libraries, workstations.
"""
from __future__ import annotations

import pytest

_VALID_ENTRY = {"path": "/Library/Audio/Plug-Ins/VST3/Reverb.vst3", "format": "vst3", "version": "2.1.0"}
_VALID_AU    = {"path": "/Library/Audio/Plug-Ins/Components/Reverb.component", "format": "au", "version": "2.1.0"}
_INVALID_FMT = {"path": "/some/path.dll", "format": "xyz", "version": "1.0"}


# ---------------------------------------------------------------------------
# Shared parametrized checks
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("list_url", [
    "/studio/session/effects",
    "/studio/session/instruments",
    "/studio/tools/workflow",
    "/studio/session/libraries",
    "/studio/session/workstations",
])
async def test_response_includes_disk_paths(client, list_url):
    data = (await client.get(list_url)).json()
    assert "disk_paths" in data["items"][0]


@pytest.mark.parametrize("insert_sql,id_col,patch_url", [
    (
        "INSERT INTO instruments (instrument_name) VALUES ('DPTest Inst') RETURNING instrument_id",
        "instrument_id",
        "/studio/session/instruments/{id}",
    ),
    (
        "INSERT INTO workflow_tools (tool_name) VALUES ('DPTest WF') RETURNING workflow_tool_id",
        "workflow_tool_id",
        "/studio/tools/workflow/{id}",
    ),
    (
        "INSERT INTO libraries (library_name) VALUES ('DPTest Lib') RETURNING library_id",
        "library_id",
        "/studio/session/libraries/{id}",
    ),
    (
        "INSERT INTO workstations (tool_name) VALUES ('DPTest WS') RETURNING workstation_id",
        "workstation_id",
        "/studio/session/workstations/{id}",
    ),
])
async def test_patch_catalog_disk_paths(client, conn, admin_headers, insert_sql, id_col, patch_url):
    row = await conn.fetchrow(insert_sql)
    resp = await client.patch(
        patch_url.format(id=row[id_col]),
        json={"disk_paths": [_VALID_ENTRY]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["disk_paths"] == [_VALID_ENTRY]


@pytest.mark.parametrize("insert_sql,id_col,patch_url", [
    (
        "INSERT INTO instruments (instrument_name) VALUES ('DPTest Inst Bad') RETURNING instrument_id",
        "instrument_id",
        "/studio/session/instruments/{id}",
    ),
    (
        "INSERT INTO libraries (library_name) VALUES ('DPTest Lib Bad') RETURNING library_id",
        "library_id",
        "/studio/session/libraries/{id}",
    ),
])
async def test_patch_catalog_disk_paths_invalid_format(client, conn, admin_headers, insert_sql, id_col, patch_url):
    row = await conn.fetchrow(insert_sql)
    resp = await client.patch(
        patch_url.format(id=row[id_col]),
        json={"disk_paths": [_INVALID_FMT]},
        headers=admin_headers,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Effects — full coverage (create, multi-entry, clear, audit, invalid format)
# ---------------------------------------------------------------------------

async def test_patch_effect_disk_paths_single_entry(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO effects (effect_name) VALUES ('DPTest Single') RETURNING effect_id"
    )
    resp = await client.patch(
        f"/studio/session/effects/{row['effect_id']}",
        json={"disk_paths": [_VALID_ENTRY]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["disk_paths"] == [_VALID_ENTRY]


async def test_patch_effect_disk_paths_multiple_entries(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO effects (effect_name) VALUES ('DPTest Multi') RETURNING effect_id"
    )
    entries = [_VALID_ENTRY, _VALID_AU]
    resp = await client.patch(
        f"/studio/session/effects/{row['effect_id']}",
        json={"disk_paths": entries},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["disk_paths"] == entries


async def test_patch_effect_disk_paths_empty_list(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO effects (effect_name, disk_paths) VALUES ('DPTest Clear', $1) RETURNING effect_id",
        '[{"path":"/x","format":"vst3","version":"1.0"}]',
    )
    resp = await client.patch(
        f"/studio/session/effects/{row['effect_id']}",
        json={"disk_paths": []},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["disk_paths"] == []


async def test_patch_effect_disk_paths_invalid_format(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO effects (effect_name) VALUES ('DPTest BadFmt') RETURNING effect_id"
    )
    resp = await client.patch(
        f"/studio/session/effects/{row['effect_id']}",
        json={"disk_paths": [_INVALID_FMT]},
        headers=admin_headers,
    )
    assert resp.status_code == 422


async def test_effect_disk_paths_defaults_to_empty(client, conn):
    row = await conn.fetchrow(
        "INSERT INTO effects (effect_name) VALUES ('DPTest Default') RETURNING effect_id"
    )
    resp = await client.get(f"/studio/session/effects/{row['effect_id']}")
    assert resp.status_code == 200
    assert resp.json()["disk_paths"] == []


async def test_create_effect_with_disk_paths(client, admin_headers):
    resp = await client.post(
        "/studio/session/effects",
        json={"effect_name": "DPTest Create", "disk_paths": [_VALID_ENTRY]},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["disk_paths"] == [_VALID_ENTRY]


async def test_patch_effect_disk_paths_audited(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO effects (effect_name) VALUES ('DPTest Audit') RETURNING effect_id"
    )
    effect_id = row["effect_id"]
    await client.patch(
        f"/studio/session/effects/{effect_id}",
        json={"disk_paths": [_VALID_ENTRY]},
        headers=admin_headers,
    )
    audit = await conn.fetchrow(
        "SELECT new_data FROM audit_log WHERE table_name='effects' AND record_id=$1 "
        "ORDER BY performed_at DESC LIMIT 1",
        effect_id,
    )
    assert "disk_paths" in audit["new_data"]
