import os
os.environ.setdefault("DB_NAME", "controlroomdb_test")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")

import json
import bcrypt
import pytest_asyncio
import asyncpg
from httpx import AsyncClient, ASGITransport

from main import app
from database import get_conn
from routers.auth import _create_token

TEST_DSN = "postgresql://studio:studio@localhost:5432/controlroomdb_test"


@pytest_asyncio.fixture()
async def conn():
    """Per-test direct connection with a rolled-back transaction."""
    connection = await asyncpg.connect(dsn=TEST_DSN)
    await connection.set_type_codec("json",  encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    await connection.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    tx = connection.transaction()
    await tx.start()
    yield connection
    await tx.rollback()
    await connection.close()


@pytest_asyncio.fixture()
async def client(conn):
    """AsyncClient wired to the FastAPI app, sharing the test transaction."""
    async def override_get_conn():
        yield conn

    app.dependency_overrides[get_conn] = override_get_conn

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture()
async def auth_headers(conn):
    """Insert a regular test user and return bearer token headers (role='user')."""
    hashed = bcrypt.hashpw(b"testpass", bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES ('testuser', $1, 'user')", hashed
    )
    token = _create_token("testuser", "user")
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture()
async def admin_headers(conn):
    """Insert an admin test user and return bearer token headers (role='admin')."""
    hashed = bcrypt.hashpw(b"adminpass", bcrypt.gensalt(rounds=4)).decode()
    await conn.execute(
        "INSERT INTO users (username, password_hash, role) VALUES ('adminuser', $1, 'admin')", hashed
    )
    token = _create_token("adminuser", "admin")
    return {"Authorization": f"Bearer {token}"}
