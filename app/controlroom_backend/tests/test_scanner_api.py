"""Integration tests for the Plugin Scanner API — ingest, confirm, keys, exclusions, history.

Tests run inside a rolled-back transaction so no data persists.
"""
from __future__ import annotations

import bcrypt
import pytest
import pytest_asyncio

from ._scanner_helpers import insert_scan


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture()
async def scanner_key(conn):
    """Insert a scanner API key; return (key_id, raw_key)."""
    raw = "psc_" + "a" * 64
    hashed = bcrypt.hashpw(raw.encode(), bcrypt.gensalt(rounds=4)).decode()
    key_id = await conn.fetchval(
        "INSERT INTO scanner_api_keys (label, key_hint, hashed_key) "
        "VALUES ($1, $2, $3) RETURNING key_id",
        "test-key", raw[-4:], hashed,
    )
    return key_id, raw


# ---------------------------------------------------------------------------
# POST /scanner/scan
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ingest_scan_returns_summary(client, conn, scanner_key):
    _, raw = scanner_key
    payload = {
        "source_machine": "studio-mac",
        "plugins": [
            {"name": "Reverb Pro", "vendor": "Acme Audio",
             "version": "1.0.0", "format": "vst3", "path": "/path/reverb.vst3",
             "metadata_source": "moduleinfo.json"},
        ],
    }
    response = await client.post(
        "/scanner/scan",
        json=payload,
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "scan_id" in data
    # S-12: response uses new five-bucket vocabulary; no old-vocab keys
    assert data["unlinked"] + data["needs_review"] == 1
    for old in ("matched", "conflicted", "unconfirmed", "untracked", "ignored"):
        assert old not in data
    stored = await conn.fetchval(
        "SELECT metadata_source FROM plugin_scan_results WHERE scan_id=$1",
        data["scan_id"],
    )
    assert stored == "moduleinfo.json"


@pytest.mark.asyncio
async def test_ingest_scan_invalid_key_returns_401(client):
    response = await client.post(
        "/scanner/scan",
        json={"source_machine": "x", "plugins": []},
        headers={"Authorization": "Bearer psc_invalidkey"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_ingest_scan_missing_auth_returns_401(client):
    response = await client.post(
        "/scanner/scan",
        json={"source_machine": "x", "plugins": []},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_ingest_scan_revoked_key_returns_401(client, conn, scanner_key):
    key_id, raw = scanner_key
    await conn.execute(
        "UPDATE scanner_api_keys SET revoked_at=NOW() WHERE key_id=$1", key_id,
    )
    response = await client.post(
        "/scanner/scan",
        json={"source_machine": "x", "plugins": []},
        headers={"Authorization": f"Bearer {raw}"},
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /scanner/confirm
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_confirm_reject_clears_match(client, conn, admin_headers):
    _, result_id = await insert_scan(conn, "needs_review")
    response = await client.post(
        "/scanner/confirm",
        json={"confirmations": [{"result_id": str(result_id), "action": "reject"}]},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["applied"] == 1
    updated = await conn.fetchval(
        "SELECT status FROM plugin_scan_results WHERE result_id=$1", result_id,
    )
    assert updated == "unlinked"  # U-08: reject → unlinked (was 'untracked')


@pytest.mark.asyncio
async def test_confirm_ignore_adds_exclusion_and_removes_link(client, conn, admin_headers):
    _, result_id = await insert_scan(conn, "unlinked")
    fp = "acme audio reverb pro"
    await conn.execute(
        "INSERT INTO scanner_plugin_links "
        "(scanned_vendor,scanned_name,fingerprint,record_id,record_table,confirmed_by) "
        "VALUES ($1,$2,$3,$4,$5,$6)",
        "Acme Audio", "Reverb Pro", fp,
        "00000000-0000-0000-0000-000000000001", "effects", "adminuser",
    )
    response = await client.post(
        "/scanner/confirm",
        json={"confirmations": [{"result_id": str(result_id), "action": "ignore"}]},
        headers=admin_headers,
    )
    assert response.status_code == 200
    count = await conn.fetchval(
        "SELECT COUNT(*) FROM scanner_exclusions WHERE vendor='Acme Audio' AND name='Reverb Pro'"
    )
    assert count == 1
    link_count = await conn.fetchval(
        "SELECT COUNT(*) FROM scanner_plugin_links WHERE fingerprint=$1", fp,
    )
    assert link_count == 0
    status = await conn.fetchval(
        "SELECT status FROM plugin_scan_results WHERE result_id=$1", result_id,
    )
    assert status == "excluded"  # U-08: ignore → excluded (was 'ignored')


@pytest.mark.asyncio
async def test_confirm_unknown_result_id_returns_error_entry(client, admin_headers):
    fake_id = "00000000-0000-0000-0000-000000000099"
    response = await client.post(
        "/scanner/confirm",
        json={"confirmations": [{"result_id": fake_id, "action": "reject"}]},
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["applied"] == 0
    assert len(data["errors"]) == 1
    assert data["errors"][0]["result_id"] == fake_id


@pytest.mark.asyncio
async def test_confirm_requires_admin(client, conn, auth_headers):
    _, result_id = await insert_scan(conn, "unlinked")
    response = await client.post(
        "/scanner/confirm",
        json={"confirmations": [{"result_id": str(result_id), "action": "reject"}]},
        headers=auth_headers,
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# API key management
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_key_returns_plaintext_once(client, admin_headers):
    response = await client.post(
        "/scanner/keys",
        json={"label": "ci-runner"},
        headers=admin_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["key"].startswith("psc_")
    assert "hashed_key" not in data


@pytest.mark.asyncio
async def test_create_key_rate_limiter_is_registered(client, admin_headers):
    """Verifies the limiter is wired to the app — normal requests still return 201."""
    from main import app
    assert hasattr(app.state, "limiter"), "SlowAPI limiter must be registered on app.state"
    response = await client.post(
        "/scanner/keys",
        json={"label": "rate-limit-smoke"},
        headers=admin_headers,
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_list_keys_omits_hashed_key(client, conn, scanner_key, admin_headers):
    response = await client.get("/scanner/keys", headers=admin_headers)
    assert response.status_code == 200
    for item in response.json():
        assert "hashed_key" not in item


@pytest.mark.asyncio
async def test_revoke_key_404_on_second_attempt(client, conn, scanner_key, admin_headers):
    key_id, _ = scanner_key
    r1 = await client.delete(f"/scanner/keys/{key_id}", headers=admin_headers)
    assert r1.status_code == 204
    r2 = await client.delete(f"/scanner/keys/{key_id}", headers=admin_headers)
    assert r2.status_code == 404


# ---------------------------------------------------------------------------
# Exclusion management
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_add_and_remove_exclusion(client, conn, admin_headers):
    r_add = await client.post(
        "/scanner/exclude",
        json={"vendor": "Acme Audio", "name": "Reverb Pro"},
        headers=admin_headers,
    )
    assert r_add.status_code == 204
    excl_id = await conn.fetchval(
        "SELECT exclusion_id FROM scanner_exclusions WHERE vendor='Acme Audio' AND name='Reverb Pro'"
    )
    assert excl_id is not None
    r_del = await client.delete(f"/scanner/exclude/{excl_id}", headers=admin_headers)
    assert r_del.status_code == 204


@pytest.mark.asyncio
async def test_list_exclusions_returns_excluded_by_and_format(client, conn, auth_headers):
    await conn.execute(
        "INSERT INTO scanner_exclusions (vendor, name, excluded_by, format) "
        "VALUES ($1, $2, $3, $4)",
        "Acme Audio", "Reverb Pro", "adminuser", "VST3",
    )
    response = await client.get("/scanner/exclusions", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["excluded_by"] == "adminuser"
    assert data[0]["format"] == "VST3"


@pytest.mark.asyncio
async def test_list_exclusions_null_fields_for_legacy_rows(client, conn, auth_headers):
    await conn.execute(
        "INSERT INTO scanner_exclusions (vendor, name) VALUES ($1, $2)",
        "Legacy Vendor", "Old Plugin",
    )
    response = await client.get("/scanner/exclusions", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["excluded_by"] is None
    assert data[0]["format"] is None


@pytest.mark.asyncio
async def test_add_exclusion_stores_format_and_excluded_by(client, conn, admin_headers):
    r = await client.post(
        "/scanner/exclude",
        json={"vendor": "Acme Audio", "name": "Reverb Pro", "format": "VST3"},
        headers=admin_headers,
    )
    assert r.status_code == 204
    row = await conn.fetchrow(
        "SELECT excluded_by, format FROM scanner_exclusions "
        "WHERE vendor='Acme Audio' AND name='Reverb Pro'"
    )
    assert row["excluded_by"] == "adminuser"
    assert row["format"] == "VST3"


@pytest.mark.asyncio
async def test_add_exclusion_idempotent_on_duplicate(client, conn, admin_headers):
    payload = {"vendor": "Acme Audio", "name": "Reverb Pro", "format": "VST3"}
    r1 = await client.post("/scanner/exclude", json=payload, headers=admin_headers)
    r2 = await client.post("/scanner/exclude", json=payload, headers=admin_headers)
    assert r1.status_code == 204
    assert r2.status_code == 204
    count = await conn.fetchval(
        "SELECT COUNT(*) FROM scanner_exclusions WHERE vendor='Acme Audio' AND name='Reverb Pro'"
    )
    assert count == 1


# ---------------------------------------------------------------------------
# GET /scanner/exclusions — auth variants
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_exclusions_accepts_api_key_auth(client, conn, scanner_key):
    _, raw = scanner_key
    await conn.execute(
        "INSERT INTO scanner_exclusions (vendor, name, excluded_by, format) VALUES ($1, $2, $3, $4)",
        "Waves", "SSL", "adminuser", "VST3",
    )
    response = await client.get("/scanner/exclusions", headers={"Authorization": f"Bearer {raw}"})
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["vendor"] == "Waves"
    assert data[0]["name"] == "SSL"


@pytest.mark.asyncio
async def test_list_exclusions_rejects_revoked_api_key(client, conn, scanner_key):
    key_id, raw = scanner_key
    await conn.execute("UPDATE scanner_api_keys SET revoked_at=NOW() WHERE key_id=$1", key_id)
    response = await client.get("/scanner/exclusions", headers={"Authorization": f"Bearer {raw}"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Scan history / purge
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_scans_returns_history(client, conn, auth_headers):
    await insert_scan(conn, "known")
    response = await client.get("/scanner/scans", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["source_machine"] == "test-machine"
    # U-08: five-bucket status counts + derived confirmation counts
    sc = data[0]["status_counts"]
    assert sc["known"] == 1
    assert set(sc.keys()) == {"known", "needs_review", "unlinked", "orphaned", "excluded"}
    assert set(data[0]["confirmation_counts"].keys()) == {"confirmed", "rejected", "excluded"}


@pytest.mark.asyncio
async def test_scan_history_confirmation_excluded_requires_confirmed_by(client, conn, auth_headers):
    # An 'excluded' row with no confirmed_by is counted in StatusCounts.excluded (total)
    # but NOT ConfirmationCounts.excluded (manual exclusions only).
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ('m', 1) RETURNING scan_id"
    )
    await conn.execute(
        "INSERT INTO plugin_scan_results (scan_id, name, vendor, version, format, path, status) "
        "VALUES ($1, 'N', 'V', '1.0', 'vst3', '/p', 'excluded')",
        scan_id,
    )
    data = (await client.get("/scanner/scans", headers=auth_headers)).json()
    run = next((d for d in data if d["scan_id"] == str(scan_id)), None)
    assert run is not None
    assert run["status_counts"]["excluded"] == 1
    assert run["confirmation_counts"]["excluded"] == 0


@pytest.mark.asyncio
async def test_purge_scans_removes_old_runs(client, conn, admin_headers):
    await conn.execute(
        "INSERT INTO plugin_scans (source_machine, total_count, scanned_at) "
        "VALUES ('old-machine', 0, NOW() - INTERVAL '100 days')"
    )
    response = await client.delete("/scanner/scans?older_than_days=90", headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["deleted_count"] == 1


# ---------------------------------------------------------------------------
# RBAC — admin-only routes
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_user_cannot_create_key(client, auth_headers):
    r = await client.post("/scanner/keys", json={"label": "x"}, headers=auth_headers)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_user_cannot_purge_scans(client, auth_headers):
    r = await client.delete("/scanner/scans?older_than_days=30", headers=auth_headers)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_cannot_list_keys(client):
    r = await client.get("/scanner/keys")
    assert r.status_code == 401
