from tests.conftest import insert_audit, insert_acknowledged_audit, insert_undone_audit


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
                                     record_id=brand_id)
    response = await client.delete(
        f"/admin/change-review/{audit_id}/permanent", headers=admin_headers
    )
    assert response.status_code == 400


async def _do_permanent_delete(client, admin_headers, conn):
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name, deleted_at) VALUES ('__perm__', NOW()) RETURNING brand_id"
    )
    audit_id, _ = await insert_audit(conn, table="brands", operation="DELETE",
                                     record_id=brand_id)
    response = await client.delete(
        f"/admin/change-review/{audit_id}/permanent", headers=admin_headers
    )
    assert response.status_code == 204
    return brand_id, audit_id


async def test_permanent_hard_deletes_record_and_sets_undone_fields(client, admin_headers, conn):
    """Permanent delete removes the record row and stamps undone_at/undone_by on the audit entry."""
    brand_id, audit_id = await _do_permanent_delete(client, admin_headers, conn)
    brand_row = await conn.fetchrow("SELECT brand_id FROM brands WHERE brand_id = $1", brand_id)
    assert brand_row is None
    audit_row = await conn.fetchrow(
        "SELECT undone_at, undone_by FROM audit_log WHERE audit_id = $1", audit_id
    )
    assert audit_row["undone_at"] is not None
    assert audit_row["undone_by"] == "adminuser"


async def test_permanent_returns_409_if_already_resolved(client, admin_headers, conn):
    audit_id, brand_id = await insert_acknowledged_audit(conn, operation="DELETE")
    response = await client.delete(
        f"/admin/change-review/{audit_id}/permanent", headers=admin_headers
    )
    assert response.status_code == 409
    assert "already acknowledged" in response.json()["detail"]


async def test_permanent_returns_409_if_already_undone(client, admin_headers, conn):
    audit_id, _ = await insert_undone_audit(conn, operation="DELETE")
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
                                     record_id=brand_id)
    response = await client.delete(
        f"/admin/change-review/{audit_id}/permanent", headers=admin_headers
    )
    assert response.status_code == 409
    assert "referenced" in response.json()["detail"]
