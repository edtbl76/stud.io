import pytest
from tests.conftest import insert_audit, insert_acknowledged_audit


async def test_change_review_requires_auth(client):
    response = await client.get("/studio/admin/change-review")
    assert response.status_code == 401


async def test_change_review_accessible_by_regular_user(client, auth_headers):
    """Regular users can read the change review list (read-only)."""
    response = await client.get("/studio/admin/change-review", headers=auth_headers)
    assert response.status_code == 200


async def test_change_review_returns_pending_by_default(client, admin_headers, conn):
    audit_id, _ = await insert_audit(conn, operation="DELETE")
    response = await client.get("/studio/admin/change-review", headers=admin_headers)
    data = response.json()
    assert data["total"] >= 1
    ids = [e["audit_id"] for e in data["entries"]]
    assert str(audit_id) in ids


async def test_change_review_excludes_acknowledged_from_pending(client, admin_headers, conn):
    audit_id, _ = await insert_acknowledged_audit(conn, operation="DELETE")
    response = await client.get("/studio/admin/change-review", headers=admin_headers)
    data = response.json()
    ids = [e["audit_id"] for e in data["entries"]]
    assert str(audit_id) not in ids


async def test_change_review_status_all_includes_acknowledged(client, admin_headers, conn):
    audit_id, _ = await insert_acknowledged_audit(conn, operation="DELETE")
    response = await client.get("/studio/admin/change-review?status=all", headers=admin_headers)
    data = response.json()
    ids = [e["audit_id"] for e in data["entries"]]
    assert str(audit_id) in ids


async def test_change_review_filter_by_table(client, admin_headers, conn):
    brands_id, _ = await insert_audit(conn, table="brands", operation="DELETE")
    effect_id = await conn.fetchval(
        """INSERT INTO effects (effect_name, deleted_at)
           VALUES ('__fx_test__', NOW()) RETURNING effect_id"""
    )
    effects_id, _ = await insert_audit(conn, table="effects", operation="DELETE",
                                       record_id=effect_id)
    response = await client.get("/studio/admin/change-review?table=brands", headers=admin_headers)
    data = response.json()
    ids = [e["audit_id"] for e in data["entries"]]
    assert str(brands_id) in ids
    assert str(effects_id) not in ids


async def test_change_review_filter_by_operation(client, admin_headers, conn):
    delete_id, _ = await insert_audit(conn, operation="DELETE")
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__upd_test2__') RETURNING brand_id"
    )
    update_id, _ = await insert_audit(conn, operation="UPDATE", record_id=brand_id)
    response = await client.get("/studio/admin/change-review?operation=DELETE", headers=admin_headers)
    data = response.json()
    ids = [e["audit_id"] for e in data["entries"]]
    assert str(delete_id) in ids
    assert str(update_id) not in ids


async def test_change_review_pagination(client, admin_headers, conn):
    """3 pending entries, page_size=2 → first page has 2, total=3."""
    for _ in range(3):
        brand_id = await conn.fetchval(
            "INSERT INTO brands (brand_name) VALUES ('__pg_test__') RETURNING brand_id"
        )
        await insert_audit(conn, operation="CREATE", record_id=brand_id)
    response = await client.get(
        "/studio/admin/change-review?page=1&page_size=2", headers=admin_headers
    )
    data = response.json()
    assert len(data["entries"]) == 2
    assert data["total"] >= 3
    assert data["page"] == 1
    assert data["page_size"] == 2


async def test_change_review_response_shape(client, admin_headers, conn):
    """Response includes all required fields on each entry."""
    await insert_audit(conn, operation="UPDATE")
    response = await client.get("/studio/admin/change-review", headers=admin_headers)
    data = response.json()
    assert data["total"] >= 1
    entry = data["entries"][0]
    for field in ["audit_id", "table_name", "record_id", "operation",
                  "performed_by", "performed_at", "acknowledged_at",
                  "acknowledged_by", "undone_at", "undone_by", "record_display_name"]:
        assert field in entry


async def test_change_review_invalid_status_returns_422(client, admin_headers):
    response = await client.get("/studio/admin/change-review?status=garbage", headers=admin_headers)
    assert response.status_code == 422


@pytest.mark.parametrize("params", [{"page": 0}, {"page_size": 0}])
async def test_change_review_invalid_page_params_return_422(client, admin_headers, params):
    resp = await client.get("/studio/admin/change-review", params=params, headers=admin_headers)
    assert resp.status_code == 422
