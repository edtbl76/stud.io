"""U-12: pattern create/delete/acknowledge + counts."""
import pytest

from routers.scanner_pattern_rules import compile_pattern
from ._scanner_helpers import insert_scan


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
    _, result_id = await insert_scan(conn, status="untracked")
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
