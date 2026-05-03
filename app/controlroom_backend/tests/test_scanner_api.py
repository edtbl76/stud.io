"""Integration tests for the Plugin Scanner API routes.

Tests run inside a rolled-back transaction so no data persists.
"""
from __future__ import annotations

import bcrypt
import pytest
import pytest_asyncio


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


async def _insert_scan(conn, status: str = "untracked") -> tuple:
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1, $2) RETURNING scan_id",
        "test-machine", 1,
    )
    result_id = await conn.fetchval(
        "INSERT INTO plugin_scan_results "
        "(scan_id, name, vendor, version, format, path, status) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING result_id",
        scan_id, "Reverb Pro", "Acme Audio", "1.0.0", "vst3", "/path/reverb.vst3", status,
    )
    return scan_id, result_id


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
    assert data["untracked"] + data["matched"] + data["unconfirmed"] == 1
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
# GET /scanner/report
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_report_returns_grouped_results(client, conn, auth_headers):
    await _insert_scan(conn, "untracked")
    response = await client.get("/scanner/report", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "untracked" in data and len(data["untracked"]) == 1
    assert data["untracked"][0]["name"] == "Reverb Pro"


@pytest.mark.asyncio
async def test_get_report_no_scan_returns_404(client, auth_headers):
    response = await client.get("/scanner/report", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_report_requires_auth(client):
    response = await client.get("/scanner/report")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /scanner/confirm
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_confirm_reject_clears_match(client, conn, admin_headers):
    _, result_id = await _insert_scan(conn, "unconfirmed")
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
    assert updated == "untracked"


@pytest.mark.asyncio
async def test_confirm_ignore_adds_exclusion_and_removes_link(client, conn, admin_headers):
    _, result_id = await _insert_scan(conn, "untracked")
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
    _, result_id = await _insert_scan(conn, "untracked")
    response = await client.post(
        "/scanner/confirm",
        json={"confirmations": [{"result_id": str(result_id), "action": "reject"}]},
        headers=auth_headers,
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# POST /scanner/keys
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


# ---------------------------------------------------------------------------
# Scan history / purge
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_scans_returns_history(client, conn, auth_headers):
    await _insert_scan(conn)
    response = await client.get("/scanner/scans", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["source_machine"] == "test-machine"
    assert "status_counts" in data[0]
    assert "confirmation_counts" in data[0]


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
