import bcrypt
from uuid import uuid4


# ---------------------------------------------------------------------------
# GET /users
# ---------------------------------------------------------------------------

async def test_list_users_requires_auth(client):
    response = await client.get("/users")
    assert response.status_code == 401


async def test_list_users(client, auth_headers):
    response = await client.get("/users", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert any(u["username"] == "testuser" for u in data)


async def test_list_users_fields(client, auth_headers):
    response = await client.get("/users", headers=auth_headers)
    assert response.status_code == 200
    user = response.json()[0]
    for field in ("user_id", "username", "created_at"):
        assert field in user


# ---------------------------------------------------------------------------
# POST /users
# ---------------------------------------------------------------------------

async def test_create_user_requires_auth(client):
    response = await client.post("/users", json={"username": "x", "password": "y"})
    assert response.status_code == 401


async def test_create_user(client, auth_headers):
    response = await client.post(
        "/users",
        json={"username": "newuser", "password": "newpass"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "newuser"
    assert "user_id" in data
    assert "created_at" in data


async def test_create_user_duplicate(client, auth_headers):
    await client.post(
        "/users",
        json={"username": "dupuser", "password": "pass"},
        headers=auth_headers,
    )
    response = await client.post(
        "/users",
        json={"username": "dupuser", "password": "other"},
        headers=auth_headers,
    )
    assert response.status_code == 409


async def test_create_user_missing_fields(client, auth_headers):
    response = await client.post("/users", json={"username": "nopass"}, headers=auth_headers)
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /users/{id}/password
# ---------------------------------------------------------------------------

async def test_change_password_requires_auth(client):
    response = await client.patch(f"/users/{uuid4()}/password", json={"password": "new"})
    assert response.status_code == 401


async def test_change_password(client, conn, auth_headers):
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'testuser'")
    response = await client.patch(
        f"/users/{row['user_id']}/password",
        json={"password": "newpassword"},
        headers=auth_headers,
    )
    assert response.status_code == 204

    # Verify the new hash works
    updated = await conn.fetchrow("SELECT password_hash FROM users WHERE username = 'testuser'")
    assert bcrypt.checkpw(b"newpassword", updated["password_hash"].encode())


async def test_change_password_not_found(client, auth_headers):
    response = await client.patch(
        f"/users/{uuid4()}/password",
        json={"password": "x"},
        headers=auth_headers,
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /users/{id}
# ---------------------------------------------------------------------------

async def test_delete_user_requires_auth(client):
    response = await client.delete(f"/users/{uuid4()}")
    assert response.status_code == 401


async def test_delete_user(client, conn, auth_headers):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ('todelete', $1) RETURNING user_id", hashed
    )
    response = await client.delete(f"/users/{row['user_id']}", headers=auth_headers)
    assert response.status_code == 204


async def test_delete_user_not_found(client, auth_headers):
    response = await client.delete(f"/users/{uuid4()}", headers=auth_headers)
    assert response.status_code == 404


async def test_delete_user_cannot_delete_self(client, conn, auth_headers):
    row = await conn.fetchrow("SELECT user_id FROM users WHERE username = 'testuser'")
    response = await client.delete(f"/users/{row['user_id']}", headers=auth_headers)
    assert response.status_code == 400


async def test_delete_last_user_blocked(client, conn, auth_headers):
    # Remove all other users so testuser is the only one, then try deleting a second
    # inserted user while testuser is the only remaining — actually we need to test
    # that deleting the only user is blocked. Insert a second user, delete testuser
    # first so the new one is alone, then try to delete it.
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    row = await conn.fetchrow(
        "INSERT INTO users (username, password_hash) VALUES ('solouser', $1) RETURNING user_id", hashed
    )
    await conn.execute("DELETE FROM users WHERE username != 'solouser'")

    # Create a fresh token for solouser since testuser is gone
    from routers.auth import _create_token
    solo_headers = {"Authorization": f"Bearer {_create_token('solouser')}"}

    response = await client.delete(f"/users/{row['user_id']}", headers=solo_headers)
    assert response.status_code == 400
