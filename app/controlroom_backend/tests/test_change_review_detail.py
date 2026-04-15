import json
from tests.conftest import insert_audit


async def test_get_detail_requires_auth(client, conn):
    audit_id, _ = await insert_audit(conn, operation="UPDATE")
    response = await client.get(f"/admin/change-review/{audit_id}")
    assert response.status_code == 401


async def test_get_detail_accessible_by_regular_user(client, auth_headers, conn):
    audit_id, _ = await insert_audit(conn, operation="UPDATE")
    response = await client.get(f"/admin/change-review/{audit_id}", headers=auth_headers)
    assert response.status_code == 200


async def test_get_detail_returns_404_if_not_found(client, auth_headers):
    fake_id = "00000000-0000-0000-0000-000000000099"
    response = await client.get(f"/admin/change-review/{fake_id}", headers=auth_headers)
    assert response.status_code == 404


async def test_get_detail_includes_old_and_new_data(client, auth_headers, conn):
    """Detail endpoint returns old_data and new_data fields."""
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__detail_test__') RETURNING brand_id"
    )
    old = {"brand_name": "Old", "brand_id": str(brand_id)}
    new = {"brand_name": "New", "brand_id": str(brand_id)}
    row = await conn.fetchrow(
        """INSERT INTO audit_log
               (table_name, record_id, operation, performed_by, old_data, new_data)
           VALUES ('brands', $1, 'UPDATE', 'admin', $2, $3)
           RETURNING audit_id""",
        brand_id, json.dumps(old), json.dumps(new),
    )
    response = await client.get(
        f"/admin/change-review/{row['audit_id']}", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["old_data"]["brand_name"] == "Old"
    assert data["new_data"]["brand_name"] == "New"


async def test_get_detail_old_data_null_for_create(client, auth_headers, conn):
    """CREATE entries have null old_data when not captured."""
    audit_id, _ = await insert_audit(conn, operation="CREATE")
    response = await client.get(f"/admin/change-review/{audit_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["old_data"] is None
