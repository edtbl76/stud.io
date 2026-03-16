import bcrypt


# ---------------------------------------------------------------------------
# POST /auth/token
# ---------------------------------------------------------------------------

async def test_login_success(client, conn):
    hashed = bcrypt.hashpw(b"secret", bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO users (username, password_hash) VALUES ('loginuser', $1)", hashed
    )
    response = await client.post(
        "/auth/token",
        data={"username": "loginuser", "password": "secret"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client, conn):
    hashed = bcrypt.hashpw(b"correct", bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO users (username, password_hash) VALUES ('pwuser', $1)", hashed
    )
    response = await client.post(
        "/auth/token",
        data={"username": "pwuser", "password": "wrong"},
    )
    assert response.status_code == 401


async def test_login_unknown_user(client):
    response = await client.post(
        "/auth/token",
        data={"username": "nobody", "password": "anything"},
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------

async def test_me_authenticated(client, auth_headers):
    response = await client.get("/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert "user_id" in data


async def test_me_no_token(client):
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_me_invalid_token(client):
    response = await client.get("/auth/me", headers={"Authorization": "Bearer notavalidtoken"})
    assert response.status_code == 401
