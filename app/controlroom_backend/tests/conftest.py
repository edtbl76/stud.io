import os
os.environ.setdefault("DB_NAME", "controlroomdb_test")

import json
import pytest_asyncio
import asyncpg
from httpx import AsyncClient, ASGITransport

from main import app
from database import get_conn

TEST_DSN = "postgresql://studio:studio@localhost:5432/controlroomdb_test"


@pytest_asyncio.fixture()
async def conn():
    """
    Per-test direct connection with a transaction that rolls back on teardown.
    DB state is never permanently mutated.
    """
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
    """
    AsyncClient wired to the FastAPI app, sharing the test transaction
    so every request sees the same rolled-back state.
    """
    async def override_get_conn():
        yield conn

    app.dependency_overrides[get_conn] = override_get_conn

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
