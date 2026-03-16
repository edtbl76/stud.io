import io
from unittest.mock import patch, MagicMock

# Realistic pg_dump output header
_DUMP_SQL = b"-- PostgreSQL database dump\n\nSELECT 1;\n"


def _mock_pg_dump(returncode=0, stdout=_DUMP_SQL, stderr=b""):
    result = MagicMock()
    result.returncode = returncode
    result.stdout = stdout
    result.stderr = stderr
    return result


def _mock_psql(returncode=0, stderr=b""):
    result = MagicMock()
    result.returncode = returncode
    result.stderr = stderr
    return result


# ---------------------------------------------------------------------------
# GET /admin/backup
# ---------------------------------------------------------------------------

async def test_backup_requires_auth(client):
    response = await client.get("/admin/backup")
    assert response.status_code == 401


async def test_backup_returns_200(client, auth_headers):
    with patch("routers.admin_ops.subprocess.run", return_value=_mock_pg_dump()):
        response = await client.get("/admin/backup", headers=auth_headers)
    assert response.status_code == 200


async def test_backup_content_type(client, auth_headers):
    with patch("routers.admin_ops.subprocess.run", return_value=_mock_pg_dump()):
        response = await client.get("/admin/backup", headers=auth_headers)
    assert response.headers["content-type"] == "application/octet-stream"


async def test_backup_content_disposition(client, auth_headers):
    with patch("routers.admin_ops.subprocess.run", return_value=_mock_pg_dump()):
        response = await client.get("/admin/backup", headers=auth_headers)
    disposition = response.headers.get("content-disposition", "")
    assert "attachment" in disposition
    assert "controlroomdb" in disposition
    assert ".sql" in disposition


async def test_backup_body_is_sql(client, auth_headers):
    with patch("routers.admin_ops.subprocess.run", return_value=_mock_pg_dump()):
        response = await client.get("/admin/backup", headers=auth_headers)
    assert b"PostgreSQL" in response.content


async def test_backup_pg_dump_failure_returns_500(client, auth_headers):
    with patch("routers.admin_ops.subprocess.run", return_value=_mock_pg_dump(returncode=1, stderr=b"pg_dump error")):
        response = await client.get("/admin/backup", headers=auth_headers)
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


async def test_restore_rejects_non_sql_extension(client, auth_headers):
    response = await client.post(
        "/admin/restore",
        files={"file": ("dump.txt", io.BytesIO(b"SELECT 1;"), "text/plain")},
        headers=auth_headers,
    )
    assert response.status_code == 400


async def test_restore_succeeds_with_valid_sql(client, auth_headers):
    with patch("routers.admin_ops.subprocess.run", return_value=_mock_psql()):
        response = await client.post(
            "/admin/restore",
            files={"file": ("dump.sql", io.BytesIO(b"SELECT 1;"), "application/octet-stream")},
            headers=auth_headers,
        )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_restore_psql_failure_returns_500(client, auth_headers):
    with patch("routers.admin_ops.subprocess.run", return_value=_mock_psql(returncode=1, stderr=b"psql error")):
        response = await client.post(
            "/admin/restore",
            files={"file": ("dump.sql", io.BytesIO(b"SELECT 1;"), "application/octet-stream")},
            headers=auth_headers,
        )
    assert response.status_code == 500


async def test_restore_roundtrip(client, auth_headers):
    with patch("routers.admin_ops.subprocess.run", return_value=_mock_pg_dump()):
        backup_response = await client.get("/admin/backup", headers=auth_headers)
    assert backup_response.status_code == 200

    with patch("routers.admin_ops.subprocess.run", return_value=_mock_psql()):
        restore_response = await client.post(
            "/admin/restore",
            files={"file": ("controlroomdb.sql", io.BytesIO(backup_response.content), "application/octet-stream")},
            headers=auth_headers,
        )
    assert restore_response.status_code == 200
    assert restore_response.json()["status"] == "ok"
