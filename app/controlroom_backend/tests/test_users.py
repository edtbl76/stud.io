import bcrypt
from uuid import uuid4
from unittest.mock import patch

MOCK_GOOGLE_PAYLOAD = {"sub": "link-uid-456", "email": "linked@gmail.com"}


# ---------------------------------------------------------------------------
# GET /users
# ---------------------------------------------------------------------------

async def test_list_users_requires_auth(client):
    response = await client.get("/studio/admin/users")
    assert response.status_code == 401


async def test_list_users(client, auth_headers):
    response = await client.get("/studio/admin/users", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert any(u["username"] == "testuser" for u in data)


async def test_list_users_fields(client, auth_headers):
    response = await client.get("/studio/admin/users", headers=auth_headers)
    assert response.status_code == 200
    user = response.json()[0]
    for field in ("user_id", "username", "role", "created_at", "google_linked"):
        assert field in user


async def test_list_users_google_linked_false_for_password_user(client, auth_headers):
    response = await client.get("/studio/admin/users", headers=auth_headers)
    user = next(u for u in response.json() if u["username"] == "testuser")
    assert user["google_linked"] is False


# ---------------------------------------------------------------------------
# POST /users
# ---------------------------------------------------------------------------

async def test_create_user_requires_auth(client):
    response = await client.post("/studio/admin/users", json={"username": "x", "password": "y"})
    assert response.status_code == 401


async def test_create_user_requires_admin(client, auth_headers):
    response = await client.post(
        "/studio/admin/users",
        json={"username": "newuser", "password": "newpass"},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_create_user(client, admin_headers):
    response = await client.post(
        "/studio/admin/users",
        json={"username": "newuser", "password": "newpass"},
        headers=admin_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "newuser"
    assert "user_id" in data
    assert "role" in data
    assert "google_linked" in data


async def test_create_user_duplicate(client, admin_headers):
    await client.post(
        "/studio/admin/users",
        json={"username": "dupuser", "password": "pass"},
        headers=admin_headers,
    )
    response = await client.post(
        "/studio/admin/users",
        json={"username": "dupuser", "password": "other"},
        headers=admin_headers,
    )
    assert response.status_code == 409


async def test_create_user_missing_fields(client, admin_headers):
    response = await client.post("/studio/admin/users", json={"username": "nopass"}, headers=admin_headers)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /users/{id}/password
# ---------------------------------------------------------------------------

async def test_change_password_requires_auth(client):
    response = await client.patch(f"/studio/admin/users/{uuid4()}/password", json={"password": "new"})
    assert response.status_code == 401


async def test_change_password(client, conn, auth_headers):
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'testuser'")
    response = await client.patch(
        f"/studio/admin/users/{row['user_id']}/password",
        json={"password": "newpassword"},
        headers=auth_headers,
    )
    assert response.status_code == 204

    updated = await conn.fetchrow("SELECT password_hash FROM users WHERE username = 'testuser'")
    assert bcrypt.checkpw(b"newpassword", updated["password_hash"].encode())


async def test_change_password_not_found(client, auth_headers):
    response = await client.patch(
        f"/studio/admin/users/{uuid4()}/password",
        json={"password": "x"},
        headers=auth_headers,
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /users/{id}/role
# ---------------------------------------------------------------------------

async def test_change_role_requires_admin(client, conn, auth_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ('target', $1) RETURNING user_id", hashed
    )
    response = await client.patch(
        f"/studio/admin/users/{row['user_id']}/role",
        json={"role": "admin"},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_change_role_admin_can_change(client, conn, admin_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ('promote_me', $1) RETURNING user_id", hashed
    )
    response = await client.patch(
        f"/studio/admin/users/{row['user_id']}/role",
        json={"role": "admin"},
        headers=admin_headers,
    )
    assert response.status_code == 204


async def test_change_role_last_admin_blocked(client, conn, admin_headers):
    # Demote all other admins so adminuser is the only one, then verify downgrade is blocked
    await conn.execute(
        "UPDATE users SET role = 'user' WHERE username != 'adminuser' AND role = 'admin'"
    )
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'adminuser'")
    response = await client.patch(
        f"/studio/admin/users/{row['user_id']}/role",
        json={"role": "user"},
        headers=admin_headers,
    )
    assert response.status_code == 400


async def test_change_role_self_demotion_with_other_admin(client, conn, admin_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES ('second_admin', $1, 'admin')", hashed
    )
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'adminuser'")
    response = await client.patch(
        f"/studio/admin/users/{row['user_id']}/role",
        json={"role": "user"},
        headers=admin_headers,
    )
    assert response.status_code == 204


# ---------------------------------------------------------------------------
# PATCH /users/{id}/google
# ---------------------------------------------------------------------------

async def test_link_google_own_account(client, conn, auth_headers):
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'testuser'")
    with patch("routers.users.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.patch(
            f"/studio/admin/users/{row['user_id']}/google",
            json={"credential": "fake-token"},
            headers=auth_headers,
        )
    assert response.status_code == 204
    updated = await conn.fetchrow("SELECT google_id FROM users WHERE username = 'testuser'")
    assert updated["google_id"] == "link-uid-456"


async def test_link_google_admin_links_other(client, conn, admin_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ('other_user', $1) RETURNING user_id", hashed
    )
    with patch("routers.users.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.patch(
            f"/studio/admin/users/{row['user_id']}/google",
            json={"credential": "fake-token"},
            headers=admin_headers,
        )
    assert response.status_code == 204


async def test_link_google_non_admin_cannot_link_other(client, conn, auth_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ('victim', $1) RETURNING user_id", hashed
    )
    with patch("routers.users.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.patch(
            f"/studio/admin/users/{row['user_id']}/google",
            json={"credential": "fake-token"},
            headers=auth_headers,
        )
    assert response.status_code == 403


async def test_link_google_already_linked_to_other(client, conn, auth_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO users (username, password_hash, google_id, email) VALUES ('taken_user', $1, 'link-uid-456', 'linked@gmail.com')",
        hashed,
    )
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'testuser'")
    with patch("routers.users.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.patch(
            f"/studio/admin/users/{row['user_id']}/google",
            json={"credential": "fake-token"},
            headers=auth_headers,
        )
    assert response.status_code == 409


async def test_link_google_already_linked_to_self(client, conn, auth_headers):
    await conn.execute(
        "UPDATE users SET google_id = 'already-linked', email = 'old@gmail.com' WHERE username = 'testuser'"
    )
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'testuser'")
    with patch("routers.users.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.patch(
            f"/studio/admin/users/{row['user_id']}/google",
            json={"credential": "fake-token"},
            headers=auth_headers,
        )
    assert response.status_code == 409


async def test_link_google_invalid_token(client, conn, auth_headers):
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'testuser'")
    with patch("routers.users.id_token.verify_oauth2_token", side_effect=Exception("bad")):
        response = await client.patch(
            f"/studio/admin/users/{row['user_id']}/google",
            json={"credential": "bad"},
            headers=auth_headers,
        )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /users/{id}
# ---------------------------------------------------------------------------

async def test_delete_user_requires_auth(client):
    response = await client.delete(f"/studio/admin/users/{uuid4()}")
    assert response.status_code == 401


async def test_delete_user_requires_admin(client, conn, auth_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ('todelete', $1) RETURNING user_id", hashed
    )
    response = await client.delete(f"/studio/admin/users/{row['user_id']}", headers=auth_headers)
    assert response.status_code == 403


async def test_delete_user(client, conn, admin_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ('todelete', $1) RETURNING user_id", hashed
    )
    response = await client.delete(f"/studio/admin/users/{row['user_id']}", headers=admin_headers)
    assert response.status_code == 204


async def test_delete_user_not_found(client, admin_headers):
    response = await client.delete(f"/studio/admin/users/{uuid4()}", headers=admin_headers)
    assert response.status_code == 404


async def test_delete_user_cannot_delete_self(client, conn, admin_headers):
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'adminuser'")
    response = await client.delete(f"/studio/admin/users/{row['user_id']}", headers=admin_headers)
    assert response.status_code == 400


async def test_delete_last_user_blocked(client, conn, admin_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ('solouser', $1) RETURNING user_id", hashed
    )
    await conn.execute("DELETE FROM users WHERE username != 'solouser'")

    from routers.auth import _create_token
    solo_headers = {"Authorization": f"Bearer {_create_token('solouser', 'admin')}"}

    response = await client.delete(f"/studio/admin/users/{row['user_id']}", headers=solo_headers)
    assert response.status_code == 400
