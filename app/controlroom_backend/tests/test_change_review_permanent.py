from tests.conftest import insert_audit


async def test_permanent_requires_admin(client, auth_headers, conn):
    audit_id, _ = await insert_audit(conn, operation="DELETE")
    response = await client.delete(
        f"/admin/change-review/{audit_id}/permanent", headers=auth_headers
    )
    assert response.status_code == 403


async def test_permanent_returns_404_if_not_found(client, admin_headers):
    fake_id = "00000000-0000-0000-0000-000000000003"
    response = await client.delete(
        f"/admin/change-review/{fake_id}/permanent", headers=admin_headers
    )
    assert response.status_code == 404


async def test_permanent_returns_400_for_non_delete_operation(client, admin_headers, conn):
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__perm_upd__') RETURNING brand_id"
    )
    audit_id, _ = await insert_audit(conn, table="brands", operation="UPDATE",
                                     brand_id=brand_id)
    response = await client.delete(
        f"/admin/change-review/{audit_id}/permanent", headers=admin_headers
    )
    assert response.status_code == 400


async def test_permanent_hard_deletes_record(client, admin_headers, conn):
    """Permanent delete removes the record row from the DB."""
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name, deleted_at) VALUES ('__perm_del__', NOW()) RETURNING brand_id"
    )
    audit_id, _ = await insert_audit(conn, table="brands", operation="DELETE",
                                     brand_id=brand_id)
    response = await client.delete(
        f"/admin/change-review/{audit_id}/permanent", headers=admin_headers
    )
    assert response.status_code == 204
    row = await conn.fetchrow("SELECT brand_id FROM brands WHERE brand_id = $1", brand_id)
    assert row is None


async def test_permanent_sets_undone_fields(client, admin_headers, conn):
    """After /permanent, the audit entry has undone_at/undone_by set."""
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name, deleted_at) VALUES ('__perm_fields__', NOW()) RETURNING brand_id"
    )
    audit_id, _ = await insert_audit(conn, table="brands", operation="DELETE",
                                     brand_id=brand_id)
    await client.delete(
        f"/admin/change-review/{audit_id}/permanent", headers=admin_headers
    )
    row = await conn.fetchrow(
        "SELECT undone_at, undone_by FROM audit_log WHERE audit_id = $1", audit_id
    )
    assert row["undone_at"] is not None
    assert row["undone_by"] == "adminuser"


async def test_permanent_returns_409_if_already_resolved(client, admin_headers, conn):
    audit_id, brand_id = await insert_audit(conn, operation="DELETE", acknowledged_at=True)
    response = await client.delete(
        f"/admin/change-review/{audit_id}/permanent", headers=admin_headers
    )
    assert response.status_code == 409
    assert "already acknowledged" in response.json()["detail"]


async def test_permanent_returns_409_if_already_undone(client, admin_headers, conn):
    audit_id, _ = await insert_audit(conn, operation="DELETE", undone_at=True)
    response = await client.delete(
        f"/admin/change-review/{audit_id}/permanent", headers=admin_headers
    )
    assert response.status_code == 409
    assert "already undone" in response.json()["detail"]


async def test_permanent_fk_violation_returns_409(client, admin_headers, conn):
    """Permanent delete returns 409 when the record is still referenced by other records."""
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name, deleted_at) VALUES ('__perm_fk__', NOW()) RETURNING brand_id"
    )
    await conn.execute(
        "INSERT INTO models (model_name, brand_id) VALUES ('__perm_fk_model__', $1)", brand_id
    )
    audit_id, _ = await insert_audit(conn, table="brands", operation="DELETE",
                                     brand_id=brand_id)
    response = await client.delete(
        f"/admin/change-review/{audit_id}/permanent", headers=admin_headers
    )
    assert response.status_code == 409
    assert "referenced" in response.json()["detail"]
