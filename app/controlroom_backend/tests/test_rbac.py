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
        json={"legal_name": "RBAC Test Brand"},
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
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=mock_proc)):
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
# Unauthenticated — writes blocked
# ---------------------------------------------------------------------------

async def test_unauthenticated_cannot_write(client):
    response = await client.post("/brands", json={"legal_name": "No Auth"})
    assert response.status_code == 401
