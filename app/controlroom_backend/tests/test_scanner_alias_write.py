"""U-19: Set Name Alias write path — POST /scanner/aliases (admin-only).

The U-14 READ path (ingest resolves via alias) lives in test_scanner_aliases.py.
This file covers the new direct WRITE endpoint: record-aware upsert, 409 on a
divergent re-alias, target validation (404), and read-path continuity.
"""
from __future__ import annotations

import bcrypt
import pytest
import pytest_asyncio

pytestmark = pytest.mark.asyncio

_DUMMY_UUID = "00000000-0000-0000-0000-000000000000"


@pytest_asyncio.fixture()
async def scanner_key(conn):
    raw = "psc_" + "c" * 64
    hashed = bcrypt.hashpw(raw.encode(), bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO scanner_api_keys (label, key_hint, hashed_key) VALUES ($1,$2,$3)",
        "u19-key", raw[-4:], hashed,
    )
    return raw


async def _effect(conn, name, **kw):
    return await conn.fetchval(
        "INSERT INTO effects (effect_name, version, disk_paths) VALUES ($1,$2,$3) RETURNING effect_id",
        name, kw.get("version"), kw.get("disk_paths") or [],
    )


def _body(disk_name, record_id, table="effects"):
    return {"disk_name": disk_name, "catalog_record_id": str(record_id), "catalog_table": table}


def _scan(name, **kw):
    return {"source_machine": "m", "plugins": [{
        "name": name, "vendor": kw.get("vendor", "Acme"), "version": kw.get("version", "1.0"),
        "format": kw.get("format", "vst3"), "path": kw.get("path", "/x/p.vst3"),
        "metadata_source": "moduleinfo.json",
    }]}


async def _ingest(client, raw, payload):
    return await client.post("/scanner/scan", json=payload, headers={"Authorization": f"Bearer {raw}"})


async def _alias_row(conn, disk_name):
    return await conn.fetchrow(
        "SELECT catalog_record_id, catalog_table FROM scanner_name_aliases WHERE disk_name=$1",
        disk_name,
    )


# ---------------------------------------------------------------------------
# Step 2 — happy path
# ---------------------------------------------------------------------------

async def test_create_alias_writes_row_and_returns_aliasout(client, conn, admin_headers):
    eid = await _effect(conn, "Zz19Serum")
    resp = await client.post("/scanner/aliases", json=_body("Serum FX", eid), headers=admin_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["disk_name"] == "Serum FX"
    assert data["catalog_record_id"] == str(eid)
    assert data["catalog_table"] == "effects"
    assert data["created_by"] == "adminuser"
    row = await _alias_row(conn, "Serum FX")
    assert str(row["catalog_record_id"]) == str(eid)


# ---------------------------------------------------------------------------
# Step 3 — idempotent re-alias to the same record
# ---------------------------------------------------------------------------

async def test_realias_same_record_is_idempotent(client, conn, admin_headers):
    eid = await _effect(conn, "Zz19Idem")
    first = await client.post("/scanner/aliases", json=_body("Idem FX", eid), headers=admin_headers)
    assert first.status_code == 201
    again = await client.post("/scanner/aliases", json=_body("Idem FX", eid), headers=admin_headers)
    assert again.status_code == 201
    assert again.json()["catalog_record_id"] == str(eid)
    count = await conn.fetchval(
        "SELECT COUNT(*) FROM scanner_name_aliases WHERE disk_name=$1", "Idem FX",
    )
    assert count == 1


# ---------------------------------------------------------------------------
# Step 4 — divergent re-alias → 409, original unchanged
# ---------------------------------------------------------------------------

async def test_realias_to_different_record_conflicts(client, conn, admin_headers):
    first = await _effect(conn, "Zz19First")
    other = await _effect(conn, "Zz19Other")
    await client.post("/scanner/aliases", json=_body("Dup FX", first), headers=admin_headers)
    resp = await client.post("/scanner/aliases", json=_body("Dup FX", other), headers=admin_headers)
    assert resp.status_code == 409
    assert "Dup FX" in resp.json()["detail"]
    row = await _alias_row(conn, "Dup FX")
    assert str(row["catalog_record_id"]) == str(first)  # original mapping untouched


async def test_realias_same_id_different_table_conflicts(client, conn, admin_headers):
    # Alias identity is (catalog_table, catalog_record_id): a matching UUID under a
    # different table is a divergent mapping, not an idempotent re-alias.
    shared = "11111111-1111-1111-1111-111111111111"
    await conn.execute("INSERT INTO effects (effect_id, effect_name) VALUES ($1, 'Zz19DupTblE')", shared)
    await conn.execute("INSERT INTO instruments (instrument_id, instrument_name) VALUES ($1, 'Zz19DupTblI')", shared)
    await client.post("/scanner/aliases", json=_body("TblDiff FX", shared, "effects"), headers=admin_headers)
    resp = await client.post(
        "/scanner/aliases", json=_body("TblDiff FX", shared, "instruments"), headers=admin_headers,
    )
    assert resp.status_code == 409
    row = await _alias_row(conn, "TblDiff FX")
    assert row["catalog_table"] == "effects"  # original mapping untouched


# ---------------------------------------------------------------------------
# Step 5 — target validation → 404, no row written
# ---------------------------------------------------------------------------

async def test_unknown_catalog_table_404(client, conn, admin_headers):
    eid = await _effect(conn, "Zz19Tbl")
    resp = await client.post(
        "/scanner/aliases", json=_body("Tbl FX", eid, table="not_a_table"), headers=admin_headers,
    )
    assert resp.status_code == 404
    assert await _alias_row(conn, "Tbl FX") is None


async def test_missing_record_404(client, conn, admin_headers):
    resp = await client.post(
        "/scanner/aliases", json=_body("Ghost FX", _DUMMY_UUID), headers=admin_headers,
    )
    assert resp.status_code == 404
    assert await _alias_row(conn, "Ghost FX") is None


async def test_soft_deleted_record_404(client, conn, admin_headers):
    eid = await _effect(conn, "Zz19Deleted")
    await conn.execute("UPDATE effects SET deleted_at = NOW() WHERE effect_id=$1", eid)
    resp = await client.post("/scanner/aliases", json=_body("Deleted FX", eid), headers=admin_headers)
    assert resp.status_code == 404
    assert await _alias_row(conn, "Deleted FX") is None


# ---------------------------------------------------------------------------
# Step 6 — read-path integration: the written alias resolves a later scan
# ---------------------------------------------------------------------------

async def test_written_alias_resolves_subsequent_scan(client, conn, admin_headers, scanner_key):
    eid = await _effect(conn, "Zz19Live", version="1.0",
                        disk_paths=[{"path": "/lib/live.vst3", "format": "vst3", "version": "1.0"}])
    created = await client.post("/scanner/aliases", json=_body("Live FX", eid), headers=admin_headers)
    assert created.status_code == 201
    resp = await _ingest(client, scanner_key, _scan("Live FX", version="1.0"))
    assert resp.status_code == 200
    row = await conn.fetchrow(
        "SELECT record_id, confidence FROM plugin_scan_results "
        "WHERE name='Live FX' ORDER BY result_id DESC LIMIT 1",
    )
    assert row["record_id"] == eid
    assert row["confidence"] == "exact"
