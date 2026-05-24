"""Tests for POST /studio/admin/change-review/bulk-acknowledge and bulk-undo."""
from tests.conftest import insert_audit, insert_acknowledged_audit, insert_undone_audit


# ---------------------------------------------------------------------------
# Step 13: bulk-acknowledge
# ---------------------------------------------------------------------------

async def test_bulk_acknowledge_sets_acknowledged_fields(client, admin_headers, conn):
    audit_id1, _ = await insert_audit(conn, operation="UPDATE")
    audit_id2, _ = await insert_audit(conn, operation="UPDATE")
    response = await client.post(
        "/studio/admin/change-review/bulk-acknowledge",
        json={"audit_ids": [str(audit_id1), str(audit_id2)]},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["acknowledged"] == 2

    row1 = await conn.fetchrow("SELECT acknowledged_at FROM audit_log WHERE audit_id = $1", audit_id1)
    row2 = await conn.fetchrow("SELECT acknowledged_at FROM audit_log WHERE audit_id = $1", audit_id2)
    assert row1["acknowledged_at"] is not None
    assert row2["acknowledged_at"] is not None


async def test_bulk_acknowledge_skips_already_resolved_ids(client, admin_headers, conn):
    pending_id, _ = await insert_audit(conn, operation="UPDATE")
    already_acked_id, _ = await insert_acknowledged_audit(conn, operation="UPDATE")
    response = await client.post(
        "/studio/admin/change-review/bulk-acknowledge",
        json={"audit_ids": [str(pending_id), str(already_acked_id)]},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["acknowledged"] == 1


async def test_bulk_acknowledge_empty_list_returns_zero(client, admin_headers):
    response = await client.post(
        "/studio/admin/change-review/bulk-acknowledge",
        json={"audit_ids": []},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["acknowledged"] == 0


# ---------------------------------------------------------------------------
# Step 14: bulk-undo
# ---------------------------------------------------------------------------

async def test_bulk_undo_marks_entries_undone(client, admin_headers, conn):
    audit_id1, _ = await insert_audit(conn, operation="UPDATE")
    audit_id2, _ = await insert_audit(conn, operation="UPDATE")

    await conn.execute(
        "UPDATE audit_log SET old_data = '{}'::jsonb WHERE audit_id = ANY($1)",
        [audit_id1, audit_id2],
    )

    response = await client.post(
        "/studio/admin/change-review/bulk-undo",
        json={"audit_ids": [str(audit_id1), str(audit_id2)]},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["undone"] == 2

    row1 = await conn.fetchrow("SELECT undone_at FROM audit_log WHERE audit_id = $1", audit_id1)
    assert row1["undone_at"] is not None


async def test_bulk_undo_skips_already_resolved_ids(client, admin_headers, conn):
    pending_id, _ = await insert_audit(conn, operation="UPDATE")
    await conn.execute("UPDATE audit_log SET old_data = '{}'::jsonb WHERE audit_id = $1", pending_id)

    already_undone_id, _ = await insert_undone_audit(conn, operation="UPDATE")

    response = await client.post(
        "/studio/admin/change-review/bulk-undo",
        json={"audit_ids": [str(pending_id), str(already_undone_id)]},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["undone"] == 1


async def test_bulk_undo_empty_list_returns_zero(client, admin_headers):
    response = await client.post(
        "/studio/admin/change-review/bulk-undo",
        json={"audit_ids": []},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["undone"] == 0


# ---------------------------------------------------------------------------
# Step 15: admin-only
# ---------------------------------------------------------------------------

async def test_bulk_acknowledge_requires_admin(client, auth_headers, conn):
    audit_id, _ = await insert_audit(conn, operation="UPDATE")
    response = await client.post(
        "/studio/admin/change-review/bulk-acknowledge",
        json={"audit_ids": [str(audit_id)]},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_bulk_undo_requires_admin(client, auth_headers, conn):
    audit_id, _ = await insert_audit(conn, operation="UPDATE")
    response = await client.post(
        "/studio/admin/change-review/bulk-undo",
        json={"audit_ids": [str(audit_id)]},
        headers=auth_headers,
    )
    assert response.status_code == 403


async def test_bulk_acknowledge_unauthenticated_returns_401(client):
    response = await client.post(
        "/studio/admin/change-review/bulk-acknowledge",
        json={"audit_ids": []},
    )
    assert response.status_code == 401


async def test_bulk_undo_unauthenticated_returns_401(client):
    response = await client.post(
        "/studio/admin/change-review/bulk-undo",
        json={"audit_ids": []},
    )
    assert response.status_code == 401
