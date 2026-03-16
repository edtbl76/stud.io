import bcrypt
from unittest.mock import patch

MOCK_GOOGLE_PAYLOAD = {"sub": "google-uid-123", "email": "guser@gmail.com"}


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
    assert "role" in data


async def test_me_no_token(client):
    response = await client.get("/auth/me")
    assert response.status_code == 401


async def test_me_invalid_token(client):
    response = await client.get("/auth/me", headers={"Authorization": "Bearer notavalidtoken"})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST /auth/google
# ---------------------------------------------------------------------------

async def test_google_login_new_user(client):
    with patch("routers.auth.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.post("/auth/google", json={"credential": "fake-token"})
    assert response.status_code == 201
    assert "access_token" in response.json()


async def test_google_login_returning_user(client, conn):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO users (username, password_hash, google_id, email) VALUES ('guser@gmail.com', $1, 'google-uid-123', 'guser@gmail.com')",
        hashed,
    )
    with patch("routers.auth.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.post("/auth/google", json={"credential": "fake-token"})
    assert response.status_code == 200
    assert "access_token" in response.json()


async def test_google_login_invalid_token(client):
    with patch("routers.auth.id_token.verify_oauth2_token", side_effect=Exception("bad token")):
        response = await client.post("/auth/google", json={"credential": "bad"})
    assert response.status_code == 401


async def test_google_login_email_collision(client, conn):
    hashed = bcrypt.hashpw(b"pass", bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO users (username, password_hash, email) VALUES ('existing', $1, 'guser@gmail.com')",
        hashed,
    )
    with patch("routers.auth.id_token.verify_oauth2_token", return_value=MOCK_GOOGLE_PAYLOAD):
        response = await client.post("/auth/google", json={"credential": "fake-token"})
    assert response.status_code == 409


async def test_google_login_disabled(client):
    with patch("routers.auth.settings.google_client_id", ""):
        response = await client.post("/auth/google", json={"credential": "anything"})
    assert response.status_code == 501
