"""U-14: alias persistence — read path (ingest resolves via alias), precedence, end-to-end."""
from __future__ import annotations

import bcrypt
import pytest
import pytest_asyncio

from routers.scanner_actions import append_disk_path


@pytest_asyncio.fixture()
async def scanner_key(conn):
    raw = "psc_" + "b" * 64
    hashed = bcrypt.hashpw(raw.encode(), bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO scanner_api_keys (label, key_hint, hashed_key) VALUES ($1,$2,$3)",
        "u14-key", raw[-4:], hashed,
    )
    return raw


async def _effect(conn, name, **kw):
    return await conn.fetchval(
        "INSERT INTO effects (effect_name, version, disk_paths, plugin_format_ids) "
        "VALUES ($1,$2,$3,$4) RETURNING effect_id",
        name, kw.get("version"), kw.get("disk_paths") or [], kw.get("fmt_ids") or [],
    )


async def _alias(conn, disk_name, record_id, table="effects"):
    await conn.execute(
        "INSERT INTO scanner_name_aliases (disk_name, catalog_record_id, catalog_table, created_by) "
        "VALUES ($1,$2,$3,'admin')", disk_name, record_id, table,
    )


def _scan(name, **kw):
    return {"source_machine": "m", "plugins": [{
        "name": name, "vendor": kw.get("vendor", "Acme"), "version": kw.get("version", "1.0"),
        "format": kw.get("format", "vst3"), "path": kw.get("path", "/x/p.vst3"),
        "metadata_source": "moduleinfo.json",
    }]}


async def _ingest(client, raw, payload):
    return await client.post("/scanner/scan", json=payload, headers={"Authorization": f"Bearer {raw}"})


async def _last_row(conn, name):
    return await conn.fetchrow(
        "SELECT record_id, record_table, confidence, status FROM plugin_scan_results "
        "WHERE name=$1 ORDER BY result_id DESC LIMIT 1", name,
    )


# ---------------------------------------------------------------------------
# Step 4 — extracted append_disk_path core (ctx-free)
# ---------------------------------------------------------------------------

async def test_append_disk_path_appends_and_dedupes(conn):
    eid = await conn.fetchval("INSERT INTO effects (effect_name) VALUES ('Zz14Adp') RETURNING effect_id")
    entry = {"path": "/a/b.vst3", "format": "vst3", "version": "1.0"}
    await append_disk_path(conn, ("effects", eid), entry, "admin")
    await append_disk_path(conn, ("effects", eid), entry, "admin")  # dedupe by path
    dp = await conn.fetchval("SELECT disk_paths FROM effects WHERE effect_id=$1", eid)
    assert [e["path"] for e in dp] == ["/a/b.vst3"]


# ---------------------------------------------------------------------------
# Steps 8-10 — read path: ingest resolves via alias
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_alias_resolves_scanned_variant_to_known(client, conn, scanner_key):
    eid = await _effect(conn, "Zz14Reverb", version="1.0",
                        disk_paths=[{"path": "/lib/r.vst3", "format": "vst3", "version": "1.0"}])
    await _alias(conn, "Zz14Reverb(m)", str(eid))
    resp = await _ingest(client, scanner_key, _scan("Zz14Reverb(m)", version="1.0"))
    assert resp.status_code == 200
    row = await _last_row(conn, "Zz14Reverb(m)")
    assert row["record_id"] == eid
    assert row["confidence"] == "exact"
    assert row["status"] == "known"  # parent has disk_paths + version matches


@pytest.mark.asyncio
async def test_alias_version_mismatch_goes_conflicted(client, conn, scanner_key):
    eid = await _effect(conn, "Zz14Comp", version="1.0")
    await _alias(conn, "Zz14Comp(m)", str(eid))
    await _ingest(client, scanner_key, _scan("Zz14Comp(m)", version="9.9"))
    row = await _last_row(conn, "Zz14Comp(m)")
    assert row["confidence"] == "exact"
    assert row["status"] == "conflicted"


@pytest.mark.asyncio
async def test_alias_to_missing_record_does_not_resolve(client, conn, scanner_key):
    # BR-U14-09: alias → deleted/missing record falls through (mirrors _linked_plugin_row → None)
    await _alias(conn, "Zz14Ghost(m)", "00000000-0000-0000-0000-000000000009")
    resp = await _ingest(client, scanner_key, _scan("Zz14Ghost(m)"))
    assert resp.status_code == 200
    assert await _last_row(conn, "Zz14Ghost(m)") is None  # dropped, no crash


@pytest.mark.asyncio
async def test_persistent_link_beats_alias(client, conn, scanner_key):
    link_effect = await _effect(conn, "Zz14LinkTarget")
    alias_effect = await _effect(conn, "Zz14AliasTarget")
    await conn.execute(
        "INSERT INTO scanner_plugin_links (scanned_vendor,scanned_name,fingerprint,record_id,record_table,confirmed_by) "
        "VALUES ('Zz14V','Zz14Both','zz14v zz14both',$1,'effects','admin')", link_effect,
    )
    await _alias(conn, "Zz14Both", str(alias_effect))
    await _ingest(client, scanner_key, _scan("Zz14Both", vendor="Zz14V"))
    row = await _last_row(conn, "Zz14Both")
    assert row["record_id"] == link_effect  # link wins over alias


@pytest.mark.asyncio
async def test_alias_beats_fuzzy(client, conn, scanner_key):
    aliased = await _effect(conn, "Zz14Exact", version="1.0")
    await _effect(conn, "Zz14Aliasd Fuzzy Neighbor")  # a fuzzy candidate with a different id
    await _alias(conn, "Zz14Aliasd", str(aliased))
    await _ingest(client, scanner_key, _scan("Zz14Aliasd", vendor="Whatever"))
    row = await _last_row(conn, "Zz14Aliasd")
    assert row["record_id"] == aliased
    assert row["confidence"] == "exact"  # alias resolution, not a fuzzy tier


# ---------------------------------------------------------------------------
# Step 11 — seeded Mono variant end-to-end (write → read)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_seeded_mono_variant_end_to_end(client, conn, scanner_key, admin_headers):
    vst3 = await conn.fetchval("SELECT type_id FROM plugin_formats WHERE type_name='VST3'")
    brand = await conn.fetchval(
        "INSERT INTO brands (legal_name, brand_name) VALUES ('Zz14MonoAcme','Zz14MonoAcme') RETURNING brand_id"
    )
    await conn.fetchval(
        "INSERT INTO effects (effect_name, brand_id, version, plugin_format_ids) "
        "VALUES ('Zz14Mono', $1, '1.0', ARRAY[$2]::uuid[]) RETURNING effect_id", brand, vst3,
    )
    sid = await conn.fetchval("INSERT INTO plugin_scans (source_machine, total_count) VALUES ('m',1) RETURNING scan_id")
    await conn.execute(
        "INSERT INTO plugin_scan_results (scan_id, name, vendor, version, format, path, status) "
        "VALUES ($1,'Zz14Mono(m)','Zz14MonoAcme','1.0','vst3','/m/mono.vst3','untracked')", sid,
    )

    seeded = await conn.fetchval("SELECT rule_id FROM scanner_name_patterns WHERE label='Mono variant'")
    await client.patch(f"/scanner/rules/pattern/{seeded}/toggle", json={"enabled": True}, headers=admin_headers)
    ack = await client.post(f"/scanner/rules/pattern/{seeded}/acknowledge-clean", headers=admin_headers)
    assert ack.status_code == 200 and ack.json()["acknowledged"] >= 1

    # alias persisted by acknowledge
    assert await conn.fetchrow("SELECT 1 FROM scanner_name_aliases WHERE disk_name='Zz14Mono(m)'") is not None
    # a fresh scan now resolves the variant via that alias (scope to this scan — result_id is a random uuid)
    resp = await _ingest(client, scanner_key, _scan("Zz14Mono(m)", vendor="Zz14MonoAcme", version="1.0"))
    new_scan_id = resp.json()["scan_id"]
    row = await conn.fetchrow(
        "SELECT confidence, record_table FROM plugin_scan_results WHERE scan_id=$1 AND name='Zz14Mono(m)'",
        new_scan_id,
    )
    assert row["confidence"] == "exact"
    assert row["record_table"] == "effects"
