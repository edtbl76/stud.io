"""
RBAC access control tests.
Verifies admin role can write and user role cannot.
Uses /brands as the representative resource for write tests.
"""
import io
from unittest.mock import patch, AsyncMock, MagicMock


# ---------------------------------------------------------------------------
# Read access — both roles can list
# ---------------------------------------------------------------------------

async def test_user_can_list_brands(client, auth_headers):
    response = await client.get("/studio/catalog/brands", headers=auth_headers)
    assert response.status_code == 200


async def test_admin_can_list_brands(client, admin_headers):
    response = await client.get("/studio/catalog/brands", headers=admin_headers)
    assert response.status_code == 200


async def test_user_can_list_effects(client, auth_headers):
    response = await client.get("/studio/session/effects", headers=auth_headers)
    assert response.status_code == 200


async def test_user_can_list_instruments(client, auth_headers):
    response = await client.get("/studio/session/instruments", headers=auth_headers)
    assert response.status_code == 200


async def test_user_can_list_libraries(client, auth_headers):
    response = await client.get("/studio/session/libraries", headers=auth_headers)
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Write access — admin allowed, user forbidden
# ---------------------------------------------------------------------------

async def test_admin_can_create_brand(client, admin_headers):
    response = await client.post(
        "/studio/catalog/brands",
        json={"legal_name": "RBAC Test Brand", "brand_name": "RBAC Test Brand"},
        headers=admin_headers,
    )
    assert response.status_code == 201


async def test_user_cannot_create_brand(client, auth_headers):
    response = await client.post(
        "/studio/catalog/brands",
        json={"legal_name": "Should Fail"},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_user_cannot_patch_brand(client, conn, auth_headers):
    row = await conn.fetchrow("SELECT brand_id FROM brands LIMIT 1")
    if not row:
        return  # no brands in test DB, skip
    response = await client.patch(
        f"/studio/catalog/brands/{row['brand_id']}",
        json={"website": "https://forbidden.com"},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_user_cannot_delete_brand(client, conn, auth_headers):
    row = await conn.fetchrow("SELECT brand_id FROM brands LIMIT 1")
    if not row:
        return  # no brands in test DB, skip
    response = await client.delete(f"/studio/catalog/brands/{row['brand_id']}", headers=auth_headers)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Admin routes — admin allowed, user forbidden
# ---------------------------------------------------------------------------

async def test_admin_can_access_backup(client, admin_headers):
    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.communicate = AsyncMock(return_value=(b"-- PostgreSQL database dump\n", b""))
    mock_conn = AsyncMock()
    mock_conn.fetch = AsyncMock(return_value=[{"table_name": "brands"}])
    mock_conn.fetchrow = AsyncMock(return_value={"row_count": 1, "content_hash": "abc"})
    mock_conn.close = AsyncMock()
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=mock_proc)), \
         patch("asyncpg.connect", new=AsyncMock(return_value=mock_conn)):
        response = await client.get("/studio/admin/backup", headers=admin_headers)
    assert response.status_code == 200


async def test_user_cannot_access_backup(client, auth_headers):
    response = await client.get("/studio/admin/backup", headers=auth_headers)
    assert response.status_code == 403


async def test_user_cannot_restore(client, auth_headers):
    response = await client.post(
        "/studio/admin/restore",
        files={"file": ("dump.sql", io.BytesIO(b"SELECT 1;"), "application/octet-stream")},
        headers=auth_headers,
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Admin stats — admin allowed, user forbidden
# ---------------------------------------------------------------------------

async def test_user_cannot_access_stats(client, auth_headers):
    response = await client.get("/studio/admin/stats", headers=auth_headers)
    assert response.status_code == 403


async def test_unauthenticated_cannot_access_stats(client):
    response = await client.get("/studio/admin/stats")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Change review writes — admin allowed, user forbidden
# (reads are open to any authenticated user)
# ---------------------------------------------------------------------------

DUMMY_UUID = "00000000-0000-0000-0000-000000000000"


async def test_user_can_list_change_review(client, auth_headers):
    response = await client.get("/studio/admin/change-review", headers=auth_headers)
    assert response.status_code == 200


async def test_user_cannot_acknowledge_change(client, auth_headers):
    response = await client.post(
        f"/studio/admin/change-review/{DUMMY_UUID}/acknowledge", headers=auth_headers
    )
    assert response.status_code == 403


async def test_user_cannot_undo_change(client, auth_headers):
    response = await client.post(
        f"/studio/admin/change-review/{DUMMY_UUID}/undo", headers=auth_headers
    )
    assert response.status_code == 403


async def test_user_cannot_delete_change_review(client, auth_headers):
    response = await client.delete(
        f"/studio/admin/change-review/{DUMMY_UUID}/permanent", headers=auth_headers
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Import/Export — admin allowed, user forbidden
# ---------------------------------------------------------------------------

async def test_user_cannot_export_xlsx(client, auth_headers):
    response = await client.get("/studio/admin/export/xlsx?tables=brands", headers=auth_headers)
    assert response.status_code == 403


async def test_user_cannot_export_template(client, auth_headers):
    response = await client.get("/studio/admin/export/template?tables=brands", headers=auth_headers)
    assert response.status_code == 403


async def test_user_cannot_import(client, auth_headers):
    response = await client.post(
        "/studio/admin/import/xlsx",
        files={"file": ("data.xlsx", io.BytesIO(b""), "application/octet-stream")},
        headers=auth_headers,
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Users — admin-only write operations
# ---------------------------------------------------------------------------

async def test_user_can_list_users(client, auth_headers):
    response = await client.get("/studio/admin/users", headers=auth_headers)
    assert response.status_code == 200


async def test_user_cannot_create_user(client, auth_headers):
    response = await client.post(
        "/studio/admin/users",
        json={"username": "newuser", "password": "pass", "role": "user"},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_user_cannot_change_role(client, auth_headers):
    response = await client.patch(
        f"/studio/admin/users/{DUMMY_UUID}/role",
        json={"role": "admin"},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_user_cannot_delete_user(client, auth_headers):
    response = await client.delete(f"/studio/admin/users/{DUMMY_UUID}", headers=auth_headers)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Unauthenticated — writes blocked
# ---------------------------------------------------------------------------

async def test_unauthenticated_cannot_write(client):
    response = await client.post("/studio/catalog/brands", json={"legal_name": "No Auth"})
    assert response.status_code == 401


async def test_unauthenticated_cannot_acknowledge_change(client):
    response = await client.post(f"/studio/admin/change-review/{DUMMY_UUID}/acknowledge")
    assert response.status_code == 401


async def test_unauthenticated_cannot_export(client):
    response = await client.get("/studio/admin/export/xlsx?tables=brands")
    assert response.status_code == 401


async def test_unauthenticated_cannot_create_user(client):
    response = await client.post(
        "/studio/admin/users",
        json={"username": "newuser", "password": "pass", "role": "user"},
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Scanner — role enforcement
# ---------------------------------------------------------------------------

async def test_user_cannot_create_scanner_key(client, auth_headers):
    response = await client.post("/scanner/keys", json={"label": "x"}, headers=auth_headers)
    assert response.status_code == 403


async def test_user_cannot_revoke_scanner_key(client, auth_headers):
    response = await client.delete(f"/scanner/keys/{DUMMY_UUID}", headers=auth_headers)
    assert response.status_code == 403


async def test_user_cannot_add_exclusion(client, auth_headers):
    response = await client.post(
        "/scanner/exclude", json={"vendor": "Acme", "name": "Plugin"}, headers=auth_headers,
    )
    assert response.status_code == 403


async def test_user_cannot_purge_scans(client, auth_headers):
    response = await client.delete("/scanner/scans?older_than_days=30", headers=auth_headers)
    assert response.status_code == 403


async def test_unauthenticated_cannot_list_scanner_keys(client):
    response = await client.get("/scanner/keys")
    assert response.status_code == 401


async def test_unauthenticated_cannot_get_scan_report(client):
    response = await client.get("/scanner/report")
    assert response.status_code == 401


async def test_user_cannot_dismiss_scan_result(client, auth_headers):
    response = await client.patch(f"/scanner/results/{DUMMY_UUID}/dismiss", headers=auth_headers)
    assert response.status_code == 403


async def test_unauthenticated_cannot_dismiss_scan_result(client):
    response = await client.patch(f"/scanner/results/{DUMMY_UUID}/dismiss")
    assert response.status_code == 401


async def test_user_cannot_keep_scanner_result(client, auth_headers):
    response = await client.patch(f"/scanner/results/{DUMMY_UUID}/keep", headers=auth_headers)
    assert response.status_code == 403


async def test_unauthenticated_cannot_keep_scanner_result(client):
    response = await client.patch(f"/scanner/results/{DUMMY_UUID}/keep")
    assert response.status_code == 401


async def test_unauthenticated_cannot_list_exclusions(client):
    response = await client.get("/scanner/exclusions")
    assert response.status_code == 401


async def test_user_cannot_get_recent_scans(client, auth_headers):
    response = await client.get("/scanner/scans/recent", headers=auth_headers)
    assert response.status_code == 403


async def test_unauthenticated_cannot_get_recent_scans(client):
    response = await client.get("/scanner/scans/recent")
    assert response.status_code == 401


async def test_user_cannot_get_scan_report(client, auth_headers):
    response = await client.get(f"/scanner/scans/{DUMMY_UUID}/report", headers=auth_headers)
    assert response.status_code == 403


async def test_unauthenticated_cannot_get_scan_report_by_id(client):
    response = await client.get(f"/scanner/scans/{DUMMY_UUID}/report")
    assert response.status_code == 401


async def test_user_cannot_soft_reset(client, auth_headers):
    response = await client.post("/scanner/admin/reset/soft", headers=auth_headers)
    assert response.status_code == 403


async def test_unauthenticated_cannot_soft_reset(client):
    response = await client.post("/scanner/admin/reset/soft")
    assert response.status_code == 401


async def test_user_cannot_hard_reset(client, auth_headers):
    response = await client.post(
        "/scanner/admin/reset/hard",
        json={"confirmation_text": "RESET ALL SCANNER DATA"},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_unauthenticated_cannot_hard_reset(client):
    response = await client.post(
        "/scanner/admin/reset/hard",
        json={"confirmation_text": "RESET ALL SCANNER DATA"},
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Scanner pattern rules (U-12) — admin-only
# ---------------------------------------------------------------------------

_PATTERN_BODY = {"label": "x", "pattern": "{name}(m)", "match_fields": ["vendor"], "action": "alias_to_match"}


async def test_user_cannot_create_pattern_rule(client, auth_headers):
    response = await client.post("/scanner/rules/pattern", json=_PATTERN_BODY, headers=auth_headers)
    assert response.status_code == 403


async def test_unauthenticated_cannot_create_pattern_rule(client):
    response = await client.post("/scanner/rules/pattern", json=_PATTERN_BODY)
    assert response.status_code == 401


async def test_user_cannot_delete_pattern_rule(client, auth_headers):
    response = await client.delete(f"/scanner/rules/pattern/{DUMMY_UUID}", headers=auth_headers)
    assert response.status_code == 403


async def test_unauthenticated_cannot_delete_pattern_rule(client):
    response = await client.delete(f"/scanner/rules/pattern/{DUMMY_UUID}")
    assert response.status_code == 401


async def test_user_cannot_acknowledge_clean_pattern(client, auth_headers):
    response = await client.post(f"/scanner/rules/pattern/{DUMMY_UUID}/acknowledge-clean", headers=auth_headers)
    assert response.status_code == 403


async def test_unauthenticated_cannot_acknowledge_clean_pattern(client):
    response = await client.post(f"/scanner/rules/pattern/{DUMMY_UUID}/acknowledge-clean")
    assert response.status_code == 401


async def test_user_cannot_toggle_pattern_rule(client, auth_headers):
    response = await client.patch(
        f"/scanner/rules/pattern/{DUMMY_UUID}/toggle", json={"enabled": True}, headers=auth_headers
    )
    assert response.status_code == 403


async def test_unauthenticated_cannot_toggle_pattern_rule(client):
    response = await client.patch(f"/scanner/rules/pattern/{DUMMY_UUID}/toggle", json={"enabled": True})
    assert response.status_code == 401
