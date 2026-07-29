"""U-12 + U-13 + U-14: pattern create/delete/acknowledge + counts + resolver + alias persistence."""
from types import SimpleNamespace

import pytest

from routers.scanner_catalog import CatalogRecord
from routers.scanner_pattern_eval import (
    Resolution,
    _Eval,
    _format_matches,
    _honors_match_fields,
    compile_pattern,
    resolve_variant,
    resolve_variants,
)
from routers.scanner_pattern_rules import (
    _active_candidates,
    _append_variant_path,
    _write_alias,
)
from ._scanner_helpers import insert_scan


# ---------------------------------------------------------------------------
# U-13 resolver — pure unit tests (no DB)
# ---------------------------------------------------------------------------

def _rec(name, **kw):
    return CatalogRecord(
        record_id=kw.get("rid", "c1"), record_table="effects", name=name,
        vendor=kw.get("vendor"), version=kw.get("version"), disk_paths=[],
        plugin_format_ids=kw.get("fmt_ids") or [], search_key="",
    )


def _row(name, **kw):
    return {
        "result_id": kw.get("rid", "r1"), "name": name, "vendor": kw.get("vendor"),
        "version": kw.get("version"), "format": kw.get("fmt"),
    }


def _ctx(*recs):
    return SimpleNamespace(catalog_index=list(recs))


def _ev(pattern, match_fields, recs=(), fmt_ids=None):
    return _Eval(compile_pattern(pattern), frozenset(match_fields), list(recs), fmt_ids or {})


def test_format_matches_lookup():
    fmt_ids = {"vst3": "fid-1"}
    assert _format_matches("VST3", ["fid-1"], fmt_ids) is True   # case-insensitive
    assert _format_matches("vst3", ["fid-2"], fmt_ids) is False  # type_id not in parent
    assert _format_matches("au", ["fid-1"], fmt_ids) is False    # unknown scan format
    assert _format_matches(None, ["fid-1"], fmt_ids) is False


def test_honors_match_fields_vendor_only_ignores_version():
    parent = _rec("Reverb", vendor="Acme", version="2.0")
    row = _row("Reverb(m)", vendor="Acme", version="1.0")  # version differs
    assert _honors_match_fields(row, parent, "Reverb", _ev("{name}", {"vendor"})) is True
    assert _honors_match_fields(row, parent, "Reverb", _ev("{name}", {"vendor", "version"})) is False


def test_honors_match_fields_name_mismatch():
    parent = _rec("Delay", vendor="Acme")
    row = _row("Reverb(m)", vendor="Acme")
    assert _honors_match_fields(row, parent, "Reverb", _ev("{name}", {"vendor"})) is False


def test_honors_match_fields_format():
    fmt_ids = {"vst3": "fid-1"}
    parent = _rec("Reverb", fmt_ids=["fid-1"])
    assert _honors_match_fields(_row("Reverb(m)", fmt="vst3"), parent, "Reverb", _ev("{name}", {"format"}, fmt_ids=fmt_ids)) is True
    assert _honors_match_fields(_row("Reverb(m)", fmt="au"), parent, "Reverb", _ev("{name}", {"format"}, fmt_ids=fmt_ids)) is False


def test_resolve_variant_single_parent():
    ev = _ev("{name}(m)", {"vendor"}, [_rec("Reverb", vendor="Acme", rid="c1")])
    assert resolve_variant(_row("Reverb(m)", vendor="Acme"), ev) == Resolution("Reverb(m)", "c1", "effects")


def test_resolve_variant_does_not_fire():
    ev = _ev("{name}(m)", {"vendor"}, [_rec("Reverb", vendor="Acme")])
    assert resolve_variant(_row("Reverb", vendor="Acme"), ev) is None


def test_resolve_variant_no_qualifying_parent():
    ev = _ev("{name}(m)", {"vendor"}, [_rec("Reverb", vendor="Other")])
    assert resolve_variant(_row("Reverb(m)", vendor="Acme"), ev) is None


def test_resolve_variant_ambiguous_does_not_resolve():
    ev = _ev("{name}(m)", {"vendor"}, [_rec("Reverb", vendor="Acme", rid="c1"), _rec("Reverb", vendor="Acme", rid="c2")])
    assert resolve_variant(_row("Reverb(m)", vendor="Acme"), ev) is None


def test_resolve_variants_collects_resolutions():
    ctx = _ctx(_rec("Reverb", vendor="Acme", rid="c1"))
    patterns = [{"pattern": "{name}(m)", "match_fields": ["vendor"]}]
    rows = [_row("Reverb(m)", vendor="Acme"), _row("Other", vendor="Acme")]
    assert resolve_variants(rows, patterns, ctx, {}) == [Resolution("Reverb(m)", "c1", "effects")]


# ---------------------------------------------------------------------------
# compile_pattern (pure)
# ---------------------------------------------------------------------------

def test_compile_pattern_extracts_name():
    m = compile_pattern("{name}(m)").match("Reverb(m)")
    assert m is not None and m.group("name") == "Reverb"


def test_compile_pattern_anchors_full_string():
    # the literal suffix must be present and the whole string must match
    assert compile_pattern("{name}(m)").match("Reverb") is None
    assert compile_pattern("{name}(m)").match("Reverb(m) extra") is None


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

async def _seed_clean_variant(conn, *, parent="Reverb", vendor="Acme", version="1.0.0"):
    """A catalog parent + a '{parent}(m)' scan variant that resolves cleanly to it."""
    brand_id = await conn.fetchval(
        "INSERT INTO brands (legal_name, brand_name) VALUES ($1,$1) RETURNING brand_id", vendor
    )
    await conn.fetchval(
        "INSERT INTO effects (effect_name, brand_id, version) VALUES ($1,$2,$3) RETURNING effect_id",
        parent, brand_id, version,
    )
    _, result_id = await insert_scan(conn, status="unlinked")
    await conn.execute(
        "UPDATE plugin_scan_results SET name=$1, vendor=$2, version=$3 WHERE result_id=$4",
        f"{parent}(m)", vendor, version, result_id,
    )
    return result_id


_VALID = {"label": "Mono", "pattern": "{name}(m)", "match_fields": ["vendor"], "action": "alias_to_match"}


# ---------------------------------------------------------------------------
# POST /scanner/rules/pattern
# ---------------------------------------------------------------------------

async def test_create_pattern_returns_201_with_counts_and_enabled(client, conn, admin_headers):
    resp = await client.post("/scanner/rules/pattern", json=_VALID, headers=admin_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["enabled"] is True
    assert data["is_seeded"] is False
    for key in ("affected_count", "clean_count", "needs_review_count"):
        assert key in data
    assert data["clean_count"] + data["needs_review_count"] == data["affected_count"]


async def test_create_pattern_counts_a_clean_variant(client, conn, admin_headers):
    await _seed_clean_variant(conn)
    data = (await client.post("/scanner/rules/pattern", json=_VALID, headers=admin_headers)).json()
    assert data["affected_count"] >= 1
    assert data["clean_count"] >= 1


# U-13: match_fields-accurate counts (vendor-only ignores version; format honored)

async def test_vendor_only_pattern_ignores_version(client, conn, admin_headers):
    # parent version 1.0, variant version 9.9 — differ; match_fields={vendor} → still clean
    brand_id = await conn.fetchval("INSERT INTO brands (legal_name, brand_name) VALUES ('Zz13Acme','Zz13Acme') RETURNING brand_id")
    await conn.fetchval("INSERT INTO effects (effect_name, brand_id, version) VALUES ('Zz13Comp', $1, '1.0') RETURNING effect_id", brand_id)
    _, rid = await insert_scan(conn, status="unlinked")
    await conn.execute("UPDATE plugin_scan_results SET name='Zz13Comp(m)', vendor='Zz13Acme', version='9.9' WHERE result_id=$1", rid)
    data = (await client.post(
        "/scanner/rules/pattern",
        json={"label": "x", "pattern": "{name}(m)", "match_fields": ["vendor"], "action": "alias_to_match"},
        headers=admin_headers,
    )).json()
    assert data["clean_count"] >= 1


async def test_format_pattern_counts_clean_when_format_matches(client, conn, admin_headers):
    vst3_id = await conn.fetchval("SELECT type_id FROM plugin_formats WHERE type_name='VST3'")
    await conn.fetchval("INSERT INTO effects (effect_name, plugin_format_ids) VALUES ('Zz13Synth', ARRAY[$1]::uuid[]) RETURNING effect_id", vst3_id)
    _, rid = await insert_scan(conn, status="unlinked")
    await conn.execute("UPDATE plugin_scan_results SET name='Zz13Synth(m)', format='vst3' WHERE result_id=$1", rid)
    data = (await client.post(
        "/scanner/rules/pattern",
        json={"label": "x", "pattern": "{name}(m)", "match_fields": ["format"], "action": "alias_to_match"},
        headers=admin_headers,
    )).json()
    assert data["clean_count"] >= 1


@pytest.mark.parametrize("body, why", [
    ({**_VALID, "pattern": "noplaceholder"}, "missing {name}"),
    ({**_VALID, "pattern": "{name}{name}"}, "duplicate {name} → invalid regex"),
    ({**_VALID, "match_fields": ["name"]}, "name not allowed"),
    ({**_VALID, "match_fields": []}, "empty match_fields"),
    ({**_VALID, "match_fields": ["bogus"]}, "unknown field"),
])
async def test_create_pattern_validation_422(client, admin_headers, body, why):
    resp = await client.post("/scanner/rules/pattern", json=body, headers=admin_headers)
    assert resp.status_code == 422, why


# ---------------------------------------------------------------------------
# DELETE /scanner/rules/pattern/{id}
# ---------------------------------------------------------------------------

async def test_delete_pattern_204(client, conn, admin_headers):
    rule_id = (await client.post("/scanner/rules/pattern", json=_VALID, headers=admin_headers)).json()["rule_id"]
    resp = await client.delete(f"/scanner/rules/pattern/{rule_id}", headers=admin_headers)
    assert resp.status_code == 204
    assert await conn.fetchval("SELECT count(*) FROM scanner_name_patterns WHERE rule_id=$1", rule_id) == 0


async def test_delete_pattern_missing_404(client, admin_headers):
    resp = await client.delete("/scanner/rules/pattern/00000000-0000-0000-0000-000000000000", headers=admin_headers)
    assert resp.status_code == 404


async def test_delete_seeded_pattern_403(client, conn, admin_headers):
    seeded_id = await conn.fetchval("SELECT rule_id FROM scanner_name_patterns WHERE is_seeded=TRUE LIMIT 1")
    resp = await client.delete(f"/scanner/rules/pattern/{seeded_id}", headers=admin_headers)
    assert resp.status_code == 403
    assert await conn.fetchval("SELECT count(*) FROM scanner_name_patterns WHERE rule_id=$1", seeded_id) == 1


# ---------------------------------------------------------------------------
# acknowledge-clean
# ---------------------------------------------------------------------------

async def test_acknowledge_clean_confirms_clean_variant(client, conn, admin_headers):
    result_id = await _seed_clean_variant(conn)
    rule_id = (await client.post("/scanner/rules/pattern", json=_VALID, headers=admin_headers)).json()["rule_id"]
    resp = await client.post(f"/scanner/rules/pattern/{rule_id}/acknowledge-clean", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["acknowledged"] >= 1
    assert await conn.fetchval("SELECT confirmed_at FROM plugin_scan_results WHERE result_id=$1", result_id) is not None


async def test_acknowledge_clean_missing_404(client, admin_headers):
    resp = await client.post(
        "/scanner/rules/pattern/00000000-0000-0000-0000-000000000000/acknowledge-clean", headers=admin_headers
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# list parity
# ---------------------------------------------------------------------------

async def test_list_rules_patterns_carry_counts(client, admin_headers):
    patterns = (await client.get("/scanner/rules", headers=admin_headers)).json()["pattern"]
    assert patterns  # the seeded Mono variant exists
    for p in patterns:
        assert "affected_count" in p and "clean_count" in p and "needs_review_count" in p


# ---------------------------------------------------------------------------
# U-14 alias persistence — write path (Steps 1-6)
# ---------------------------------------------------------------------------

async def test_active_candidates_includes_path(conn):
    # Step 1: the disk_paths append needs `path` on each candidate row.
    _, result_id = await insert_scan(conn, status="unlinked")
    rows = await _active_candidates(conn)
    row = next((r for r in rows if r["result_id"] == result_id), None)
    assert row is not None
    assert row["path"] == "/path/reverb.vst3"


async def test_write_alias_inserts(conn):
    eid = await conn.fetchval("INSERT INTO effects (effect_name) VALUES ('Zz14Parent') RETURNING effect_id")
    await _write_alias(conn, Resolution("Zz14Parent(m)", str(eid), "effects"), "admin")
    row = await conn.fetchrow(
        "SELECT catalog_record_id, catalog_table, created_by FROM scanner_name_aliases WHERE disk_name='Zz14Parent(m)'"
    )
    assert row["catalog_record_id"] == eid
    assert row["catalog_table"] == "effects"
    assert row["created_by"] == "admin"


async def test_write_alias_idempotent_on_disk_name(conn):
    e1 = await conn.fetchval("INSERT INTO effects (effect_name) VALUES ('Zz14A') RETURNING effect_id")
    e2 = await conn.fetchval("INSERT INTO effects (effect_name) VALUES ('Zz14B') RETURNING effect_id")
    await _write_alias(conn, Resolution("Zz14Dup(m)", str(e1), "effects"), "admin")
    await _write_alias(conn, Resolution("Zz14Dup(m)", str(e2), "effects"), "admin")  # different record
    rows = await conn.fetch("SELECT catalog_record_id FROM scanner_name_aliases WHERE disk_name='Zz14Dup(m)'")
    assert len(rows) == 1
    assert rows[0]["catalog_record_id"] == e1  # first write wins (ON CONFLICT DO NOTHING)


async def test_append_variant_path_appends_and_dedupes(conn):
    eid = await conn.fetchval("INSERT INTO effects (effect_name) VALUES ('Zz14Pae') RETURNING effect_id")
    res = Resolution("Zz14Pae(m)", str(eid), "effects")
    row = {"path": "/x/zz14.vst3", "format": "vst3", "version": "2.0"}
    await _append_variant_path(conn, res, row, "admin")
    await _append_variant_path(conn, res, row, "admin")  # second call must not double
    dp = await conn.fetchval("SELECT disk_paths FROM effects WHERE effect_id=$1", eid)
    assert sum(1 for e in dp if e["path"] == "/x/zz14.vst3") == 1
    entry = next((e for e in dp if e["path"] == "/x/zz14.vst3"), None)
    assert entry is not None
    assert entry["format"] == "vst3" and entry["version"] == "2.0"


async def test_acknowledge_writes_alias_and_appends_disk_path(client, conn, admin_headers):
    await _seed_clean_variant(conn)  # parent Reverb/Acme/1.0.0 + scan "Reverb(m)" path /path/reverb.vst3
    rule_id = (await client.post("/scanner/rules/pattern", json=_VALID, headers=admin_headers)).json()["rule_id"]
    resp = await client.post(f"/scanner/rules/pattern/{rule_id}/acknowledge-clean", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["acknowledged"] >= 1
    alias = await conn.fetchrow(
        "SELECT catalog_record_id, catalog_table FROM scanner_name_aliases WHERE disk_name='Reverb(m)'"
    )
    assert alias is not None and alias["catalog_table"] == "effects"
    dp = await conn.fetchval("SELECT disk_paths FROM effects WHERE effect_id=$1", alias["catalog_record_id"])
    assert any(e["path"] == "/path/reverb.vst3" for e in (dp or []))


async def test_acknowledge_skips_row_when_alias_points_to_different_record(client, conn, admin_headers):
    # An existing alias for 'Zz9(m)' already points to record A.
    other = await conn.fetchval("INSERT INTO effects (effect_name) VALUES ('Zz9Other') RETURNING effect_id")
    await conn.execute(
        "INSERT INTO scanner_name_aliases (disk_name, catalog_record_id, catalog_table, created_by) "
        "VALUES ('Zz9(m)', $1, 'effects', 'admin')", other,
    )
    # A parent B named 'Zz9' (Zz9Acme) + an unconfirmed 'Zz9(m)' scan row that now resolves to B.
    brand = await conn.fetchval("INSERT INTO brands (legal_name, brand_name) VALUES ('Zz9Acme','Zz9Acme') RETURNING brand_id")
    b = await conn.fetchval("INSERT INTO effects (effect_name, brand_id) VALUES ('Zz9', $1) RETURNING effect_id", brand)
    _, rid = await insert_scan(conn, status="unlinked")
    await conn.execute("UPDATE plugin_scan_results SET name='Zz9(m)', vendor='Zz9Acme', path='/z/z9.vst3' WHERE result_id=$1", rid)
    rule_id = (await client.post("/scanner/rules/pattern", json=_VALID, headers=admin_headers)).json()["rule_id"]

    await client.post(f"/scanner/rules/pattern/{rule_id}/acknowledge-clean", headers=admin_headers)

    # alias unchanged (A wins), row left unconfirmed, B's disk_paths untouched
    assert await conn.fetchval("SELECT catalog_record_id FROM scanner_name_aliases WHERE disk_name='Zz9(m)'") == other
    assert await conn.fetchval("SELECT confirmed_at FROM plugin_scan_results WHERE result_id=$1", rid) is None
    assert not (await conn.fetchval("SELECT disk_paths FROM effects WHERE effect_id=$1", b))
