from tests.conftest import insert_audit, insert_acknowledged_audit, insert_undone_audit


async def test_acknowledge_requires_admin(client, auth_headers, conn):
    audit_id, _ = await insert_audit(conn, operation="UPDATE")
    response = await client.post(
        f"/studio/admin/change-review/{audit_id}/acknowledge", headers=auth_headers
    )
    assert response.status_code == 403


async def test_acknowledge_sets_acknowledged_fields(client, admin_headers, conn):
    audit_id, _ = await insert_audit(conn, operation="UPDATE")
    response = await client.post(
        f"/studio/admin/change-review/{audit_id}/acknowledge", headers=admin_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["acknowledged_at"] is not None
    assert data["acknowledged_by"] == "adminuser"


async def test_acknowledge_entry_no_longer_pending(client, admin_headers, conn):
    audit_id, _ = await insert_audit(conn, operation="UPDATE")
    await client.post(
        f"/studio/admin/change-review/{audit_id}/acknowledge", headers=admin_headers
    )
    pending = await client.get("/studio/admin/change-review", headers=admin_headers)
    ids = [e["audit_id"] for e in pending.json()["entries"]]
    assert str(audit_id) not in ids


async def test_acknowledge_returns_404_if_not_found(client, admin_headers):
    fake_id = "00000000-0000-0000-0000-000000000001"
    response = await client.post(
        f"/studio/admin/change-review/{fake_id}/acknowledge", headers=admin_headers
    )
    assert response.status_code == 404


async def test_acknowledge_returns_409_if_already_acknowledged(client, admin_headers, conn):
    audit_id, _ = await insert_acknowledged_audit(conn, operation="UPDATE")
    response = await client.post(
        f"/studio/admin/change-review/{audit_id}/acknowledge", headers=admin_headers
    )
    assert response.status_code == 409
    assert "already acknowledged" in response.json()["detail"]


async def test_acknowledge_returns_409_if_already_undone(client, admin_headers, conn):
    audit_id, _ = await insert_undone_audit(conn, operation="UPDATE")
    response = await client.post(
        f"/studio/admin/change-review/{audit_id}/acknowledge", headers=admin_headers
    )
    assert response.status_code == 409
    assert "already undone" in response.json()["detail"]
