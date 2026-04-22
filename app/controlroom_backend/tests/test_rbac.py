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
    response = await client.get("/brands", headers=auth_headers)
    assert response.status_code == 200


async def test_admin_can_list_brands(client, admin_headers):
    response = await client.get("/brands", headers=admin_headers)
    assert response.status_code == 200


async def test_user_can_list_effects(client, auth_headers):
    response = await client.get("/effects", headers=auth_headers)
    assert response.status_code == 200


async def test_user_can_list_instruments(client, auth_headers):
    response = await client.get("/instruments", headers=auth_headers)
    assert response.status_code == 200


async def test_user_can_list_libraries(client, auth_headers):
    response = await client.get("/libraries", headers=auth_headers)
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Write access — admin allowed, user forbidden
# ---------------------------------------------------------------------------

async def test_admin_can_create_brand(client, admin_headers):
    response = await client.post(
        "/brands",
        json={"legal_name": "RBAC Test Brand", "brand_name": "RBAC Test Brand"},
        headers=admin_headers,
    )
    assert response.status_code == 201


async def test_user_cannot_create_brand(client, auth_headers):
    response = await client.post(
        "/brands",
        json={"legal_name": "Should Fail"},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_user_cannot_patch_brand(client, conn, auth_headers):
    row = await conn.fetchrow("SELECT brand_id FROM brands LIMIT 1")
    if not row:
        return  # no brands in test DB, skip
    response = await client.patch(
        f"/brands/{row['brand_id']}",
        json={"website": "https://forbidden.com"},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_user_cannot_delete_brand(client, conn, auth_headers):
    row = await conn.fetchrow("SELECT brand_id FROM brands LIMIT 1")
    if not row:
        return  # no brands in test DB, skip
    response = await client.delete(f"/brands/{row['brand_id']}", headers=auth_headers)
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
        response = await client.get("/admin/backup", headers=admin_headers)
    assert response.status_code == 200


async def test_user_cannot_access_backup(client, auth_headers):
    response = await client.get("/admin/backup", headers=auth_headers)
    assert response.status_code == 403


async def test_user_cannot_restore(client, auth_headers):
    response = await client.post(
        "/admin/restore",
        files={"file": ("dump.sql", io.BytesIO(b"SELECT 1;"), "application/octet-stream")},
        headers=auth_headers,
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Admin stats — admin allowed, user forbidden
# ---------------------------------------------------------------------------

async def test_user_cannot_access_stats(client, auth_headers):
    response = await client.get("/admin/stats", headers=auth_headers)
    assert response.status_code == 403


async def test_unauthenticated_cannot_access_stats(client):
    response = await client.get("/admin/stats")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Change review writes — admin allowed, user forbidden
# (reads are open to any authenticated user)
# ---------------------------------------------------------------------------

DUMMY_UUID = "00000000-0000-0000-0000-000000000000"


async def test_user_can_list_change_review(client, auth_headers):
    response = await client.get("/admin/change-review", headers=auth_headers)
    assert response.status_code == 200


async def test_user_cannot_acknowledge_change(client, auth_headers):
    response = await client.post(
        f"/admin/change-review/{DUMMY_UUID}/acknowledge", headers=auth_headers
    )
    assert response.status_code == 403


async def test_user_cannot_undo_change(client, auth_headers):
    response = await client.post(
        f"/admin/change-review/{DUMMY_UUID}/undo", headers=auth_headers
    )
    assert response.status_code == 403


async def test_user_cannot_delete_change_review(client, auth_headers):
    response = await client.delete(
        f"/admin/change-review/{DUMMY_UUID}/permanent", headers=auth_headers
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Import/Export — admin allowed, user forbidden
# ---------------------------------------------------------------------------

async def test_user_cannot_export_xlsx(client, auth_headers):
    response = await client.get("/admin/export/xlsx?tables=brands", headers=auth_headers)
    assert response.status_code == 403


async def test_user_cannot_export_template(client, auth_headers):
    response = await client.get("/admin/export/template?tables=brands", headers=auth_headers)
    assert response.status_code == 403


async def test_user_cannot_import(client, auth_headers):
    response = await client.post(
        "/admin/import/xlsx",
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
    response = await client.post("/brands", json={"legal_name": "No Auth"})
    assert response.status_code == 401


async def test_unauthenticated_cannot_acknowledge_change(client):
    response = await client.post(f"/admin/change-review/{DUMMY_UUID}/acknowledge")
    assert response.status_code == 401


async def test_unauthenticated_cannot_export(client):
    response = await client.get("/admin/export/xlsx?tables=brands")
    assert response.status_code == 401


async def test_unauthenticated_cannot_create_user(client):
    response = await client.post(
        "/studio/admin/users",
        json={"username": "newuser", "password": "pass", "role": "user"},
    )
    assert response.status_code == 401
