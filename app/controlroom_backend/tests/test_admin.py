import io
import json
from unittest.mock import patch, AsyncMock, MagicMock

# Realistic pg_dump output header
_DUMP_SQL = b"-- PostgreSQL database dump\n\nSELECT 1;\n"

_MOCK_TABLES = [{"table_name": "brands"}, {"table_name": "models"}]
_MOCK_STATS = {"row_count": 10, "content_hash": "abc123"}

_MANIFEST_JSON = json.dumps({
    "created_at": "2026-03-17T12:00:00",
    "database": "masterdb",
    "tables": {
        "brands": {"rows": 10, "hash": "abc123"},
        "models": {"rows": 10, "hash": "abc123"},
    },
}, separators=(",", ":")).encode()

_BACKUP_WITH_MANIFEST = (
    b"-- BACKUP MANIFEST BEGIN\n"
    b"-- " + _MANIFEST_JSON + b"\n"
    b"-- BACKUP MANIFEST END\n\n"
    + _DUMP_SQL
)


def _mock_pg_dump(returncode=0, stdout=_DUMP_SQL, stderr=b""):
    proc = MagicMock()
    proc.returncode = returncode
    proc.communicate = AsyncMock(return_value=(stdout, stderr))
    return proc


def _mock_psql(returncode=0, stderr=b""):
    proc = MagicMock()
    proc.returncode = returncode
    proc.communicate = AsyncMock(return_value=(b"", stderr))
    return proc


def _mock_asyncpg_conn():
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=_MOCK_TABLES)
    conn.fetchrow = AsyncMock(return_value=_MOCK_STATS)
    conn.close = AsyncMock()
    return conn


# ---------------------------------------------------------------------------
# GET /admin/backup
# ---------------------------------------------------------------------------

async def test_backup_requires_auth(client):
    response = await client.get("/admin/backup")
    assert response.status_code == 401


async def test_backup_returns_200(client, admin_headers):
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_mock_pg_dump())), \
         patch("asyncpg.connect", new=AsyncMock(return_value=_mock_asyncpg_conn())):
        response = await client.get("/admin/backup", headers=admin_headers)
    assert response.status_code == 200


async def test_backup_content_type(client, admin_headers):
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_mock_pg_dump())), \
         patch("asyncpg.connect", new=AsyncMock(return_value=_mock_asyncpg_conn())):
        response = await client.get("/admin/backup", headers=admin_headers)
    assert response.headers["content-type"] == "application/octet-stream"


async def test_backup_content_disposition(client, admin_headers):
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_mock_pg_dump())), \
         patch("asyncpg.connect", new=AsyncMock(return_value=_mock_asyncpg_conn())):
        response = await client.get("/admin/backup", headers=admin_headers)
    disposition = response.headers.get("content-disposition", "")
    assert "attachment" in disposition
    assert "masterdb" in disposition
    assert ".sql" in disposition


async def test_backup_body_is_sql(client, admin_headers):
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_mock_pg_dump())), \
         patch("asyncpg.connect", new=AsyncMock(return_value=_mock_asyncpg_conn())):
        response = await client.get("/admin/backup", headers=admin_headers)
    assert b"PostgreSQL" in response.content


async def test_backup_contains_manifest(client, admin_headers):
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_mock_pg_dump())), \
         patch("asyncpg.connect", new=AsyncMock(return_value=_mock_asyncpg_conn())):
        response = await client.get("/admin/backup", headers=admin_headers)
    assert b"-- BACKUP MANIFEST BEGIN" in response.content
    assert b"-- BACKUP MANIFEST END" in response.content


async def test_backup_manifest_is_valid_json(client, admin_headers):
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_mock_pg_dump())), \
         patch("asyncpg.connect", new=AsyncMock(return_value=_mock_asyncpg_conn())):
        response = await client.get("/admin/backup", headers=admin_headers)
    lines = response.content.decode().splitlines()
    in_block = False
    manifest = None
    for line in lines:
        if line == "-- BACKUP MANIFEST BEGIN":
            in_block = True
            continue
        if line == "-- BACKUP MANIFEST END":
            break
        if in_block and line.startswith("-- "):
            manifest = json.loads(line[3:])
    assert manifest is not None
    assert "created_at" in manifest
    assert "database" in manifest
    assert "tables" in manifest


async def test_backup_pg_dump_failure_returns_500(client, admin_headers):
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_mock_pg_dump(returncode=1, stderr=b"pg_dump error"))):
        response = await client.get("/admin/backup", headers=admin_headers)
    assert response.status_code == 500


# ---------------------------------------------------------------------------
# POST /admin/restore
# ---------------------------------------------------------------------------

async def test_restore_requires_auth(client):
    response = await client.post(
        "/admin/restore",
        files={"file": ("dump.sql", io.BytesIO(b"SELECT 1;"), "application/octet-stream")},
    )
    assert response.status_code == 401


async def test_restore_rejects_non_sql_extension(client, admin_headers):
    response = await client.post(
        "/admin/restore",
        files={"file": ("dump.txt", io.BytesIO(b"SELECT 1;"), "text/plain")},
        headers=admin_headers,
    )
    assert response.status_code == 400


async def test_restore_succeeds_with_valid_sql(client, admin_headers):
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_mock_psql())):
        response = await client.post(
            "/admin/restore",
            files={"file": ("dump.sql", io.BytesIO(b"SELECT 1;"), "application/octet-stream")},
            headers=admin_headers,
        )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_restore_psql_failure_returns_500(client, admin_headers):
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_mock_psql(returncode=1, stderr=b"psql error"))):
        response = await client.post(
            "/admin/restore",
            files={"file": ("dump.sql", io.BytesIO(b"SELECT 1;"), "application/octet-stream")},
            headers=admin_headers,
        )
    assert response.status_code == 500


async def test_restore_roundtrip(client, admin_headers):
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_mock_pg_dump())), \
         patch("asyncpg.connect", new=AsyncMock(return_value=_mock_asyncpg_conn())):
        backup_response = await client.get("/admin/backup", headers=admin_headers)
    assert backup_response.status_code == 200

    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_mock_psql())):
        restore_response = await client.post(
            "/admin/restore",
            files={"file": ("masterdb.sql", io.BytesIO(backup_response.content), "application/octet-stream")},
            headers=admin_headers,
        )
    assert restore_response.status_code == 200
    assert restore_response.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# POST /admin/verify
# ---------------------------------------------------------------------------

async def test_verify_requires_auth(client):
    response = await client.post(
        "/admin/verify",
        files={"file": ("dump.sql", io.BytesIO(_BACKUP_WITH_MANIFEST), "application/octet-stream")},
    )
    assert response.status_code == 401


async def test_verify_requires_admin(client, auth_headers):
    response = await client.post(
        "/admin/verify",
        files={"file": ("dump.sql", io.BytesIO(_BACKUP_WITH_MANIFEST), "application/octet-stream")},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_verify_rejects_non_sql(client, admin_headers):
    response = await client.post(
        "/admin/verify",
        files={"file": ("dump.txt", io.BytesIO(b"SELECT 1;"), "text/plain")},
        headers=admin_headers,
    )
    assert response.status_code == 400


async def test_verify_rejects_missing_manifest(client, admin_headers):
    response = await client.post(
        "/admin/verify",
        files={"file": ("dump.sql", io.BytesIO(b"SELECT 1;"), "application/octet-stream")},
        headers=admin_headers,
    )
    assert response.status_code == 400
    assert "manifest" in response.json()["detail"].lower()


async def test_verify_passes_on_matching_hashes(client, admin_headers):
    psql_calls = [_mock_psql(), _mock_psql(), _mock_psql(), _mock_psql()]  # DROP, CREATE, restore, DROP(finally)
    call_iter = iter(psql_calls)

    async def side_effect(*args, **kwargs):
        return next(call_iter)

    with patch("asyncio.create_subprocess_exec", side_effect=side_effect), \
         patch("asyncpg.connect", new=AsyncMock(return_value=_mock_asyncpg_conn())):
        response = await client.post(
            "/admin/verify",
            files={"file": ("dump.sql", io.BytesIO(_BACKUP_WITH_MANIFEST), "application/octet-stream")},
            headers=admin_headers,
        )
    assert response.status_code == 200
    data = response.json()
    assert data["passed"] is True
    assert all(t["passed"] for t in data["tables"])


async def test_verify_fails_on_mismatched_hash(client, admin_headers):
    conn = _mock_asyncpg_conn()
    conn.fetchrow = AsyncMock(return_value={"row_count": 10, "content_hash": "different_hash"})

    psql_calls = [_mock_psql(), _mock_psql(), _mock_psql(), _mock_psql()]  # DROP, CREATE, restore, DROP(finally)
    call_iter = iter(psql_calls)

    async def side_effect(*args, **kwargs):
        return next(call_iter)

    with patch("asyncio.create_subprocess_exec", side_effect=side_effect), \
         patch("asyncpg.connect", new=AsyncMock(return_value=conn)):
        response = await client.post(
            "/admin/verify",
            files={"file": ("dump.sql", io.BytesIO(_BACKUP_WITH_MANIFEST), "application/octet-stream")},
            headers=admin_headers,
        )
    assert response.status_code == 200
    data = response.json()
    assert data["passed"] is False
    assert any(not t["hash_match"] for t in data["tables"])


async def test_verify_fails_on_mismatched_rowcount(client, admin_headers):
    conn = _mock_asyncpg_conn()
    conn.fetchrow = AsyncMock(return_value={"row_count": 99, "content_hash": "abc123"})

    psql_calls = [_mock_psql(), _mock_psql(), _mock_psql(), _mock_psql()]  # DROP, CREATE, restore, DROP(finally)
    call_iter = iter(psql_calls)

    async def side_effect(*args, **kwargs):
        return next(call_iter)

    with patch("asyncio.create_subprocess_exec", side_effect=side_effect), \
         patch("asyncpg.connect", new=AsyncMock(return_value=conn)):
        response = await client.post(
            "/admin/verify",
            files={"file": ("dump.sql", io.BytesIO(_BACKUP_WITH_MANIFEST), "application/octet-stream")},
            headers=admin_headers,
        )
    assert response.status_code == 200
    data = response.json()
    assert data["passed"] is False
    assert any(t["rows_actual"] != t["rows_expected"] for t in data["tables"])


async def test_verify_psql_failure_returns_500(client, admin_headers):
    # DROP, CREATE, restore(fails), DROP(finally - succeeds)
    psql_calls = [_mock_psql(), _mock_psql(), _mock_psql(returncode=1, stderr=b"restore failed"), _mock_psql()]
    call_iter = iter(psql_calls)

    async def side_effect(*args, **kwargs):
        return next(call_iter)

    with patch("asyncio.create_subprocess_exec", side_effect=side_effect):
        response = await client.post(
            "/admin/verify",
            files={"file": ("dump.sql", io.BytesIO(_BACKUP_WITH_MANIFEST), "application/octet-stream")},
            headers=admin_headers,
        )
    assert response.status_code == 500


async def test_verify_cleanup_on_failure(client, admin_headers):
    """DROP DATABASE must be called in finally even when restore fails."""
    subprocess_calls = []

    # CREATE, restore(fails), DROP(finally)
    psql_calls = [_mock_psql(), _mock_psql(returncode=1, stderr=b"restore failed"), _mock_psql()]
    call_iter = iter(psql_calls)

    async def side_effect(*args, **kwargs):
        subprocess_calls.append(args)
        return next(call_iter)

    with patch("asyncio.create_subprocess_exec", side_effect=side_effect):
        await client.post(
            "/admin/verify",
            files={"file": ("dump.sql", io.BytesIO(_BACKUP_WITH_MANIFEST), "application/octet-stream")},
            headers=admin_headers,
        )
    # 3 calls total: CREATE, restore, DROP(finally)
    assert len(subprocess_calls) == 3


async def test_verify_roundtrip(client, admin_headers):
    """Backup output feeds directly into verify and passes.
    Note: fully mocked — validates manifest format compatibility, not real data fidelity."""
    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=_mock_pg_dump())), \
         patch("asyncpg.connect", new=AsyncMock(return_value=_mock_asyncpg_conn())):
        backup_response = await client.get("/admin/backup", headers=admin_headers)
    assert backup_response.status_code == 200

    psql_calls = [_mock_psql(), _mock_psql(), _mock_psql(), _mock_psql()]  # DROP, CREATE, restore, DROP(finally)
    call_iter = iter(psql_calls)

    async def side_effect(*args, **kwargs):
        return next(call_iter)

    with patch("asyncio.create_subprocess_exec", side_effect=side_effect), \
         patch("asyncpg.connect", new=AsyncMock(return_value=_mock_asyncpg_conn())):
        verify_response = await client.post(
            "/admin/verify",
            files={"file": ("masterdb.sql", io.BytesIO(backup_response.content), "application/octet-stream")},
            headers=admin_headers,
        )
    assert verify_response.status_code == 200
    assert verify_response.json()["passed"] is True
