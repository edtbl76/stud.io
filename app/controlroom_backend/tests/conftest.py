# ruff: noqa: E402 — env vars must be set before app imports so pydantic-settings
# reads them when Settings() is instantiated at module level in config.py.
import os
import re
_worker = os.environ.get("PYTEST_XDIST_WORKER", "")
if _worker:
    _m = re.match(r"gw(\d+)", _worker)
    _db_name = f"masterdb_test_{_m.group(1)}" if _m else f"masterdb_test_{_worker}"
else:
    _db_name = "masterdb_test"

os.environ.setdefault("DB_NAME", _db_name)
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")

import json
import bcrypt
import pytest_asyncio
import asyncpg
from httpx import AsyncClient, ASGITransport

from main import app
from database import get_conn
from routers.auth import _create_token

TEST_DSN = f"postgresql://studio:studio@localhost:5432/{_db_name}"

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


async def insert_audit(conn, table="brands", operation="DELETE", record_id=None):
    """Insert a pending audit_log entry and return (audit_id, record_id)."""
    if record_id is None:
        record_id = await conn.fetchval(
            "INSERT INTO brands (brand_name) VALUES ('__audit_test__') RETURNING brand_id"
        )
    row = await conn.fetchrow(
        """INSERT INTO audit_log
               (table_name, record_id, operation, performed_by)
           VALUES ($1, $2, $3, $4)
           RETURNING audit_id""",
        table, record_id, operation, "admin",
    )
    return row["audit_id"], record_id


_RESOLUTION_SQL = {
    "acknowledged": (
        "UPDATE audit_log SET acknowledged_at = NOW(), acknowledged_by = 'admin'"
        " WHERE audit_id = $1"
    ),
    "undone": (
        "UPDATE audit_log SET undone_at = NOW(), undone_by = 'admin' WHERE audit_id = $1"
    ),
}


async def _insert_resolved_audit(conn, resolution, **kw):
    audit_id, record_id = await insert_audit(conn, **kw)
    await conn.execute(_RESOLUTION_SQL[resolution], audit_id)
    return audit_id, record_id


async def insert_acknowledged_audit(conn, table="brands", operation="DELETE", record_id=None):
    """Insert an already-acknowledged audit_log entry and return (audit_id, record_id)."""
    return await _insert_resolved_audit(conn, "acknowledged", table=table,
                                        operation=operation, record_id=record_id)


async def insert_undone_audit(conn, table="brands", operation="DELETE", record_id=None):
    """Insert an already-undone audit_log entry and return (audit_id, record_id)."""
    return await _insert_resolved_audit(conn, "undone", table=table,
                                        operation=operation, record_id=record_id)
