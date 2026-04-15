import json
import pytest
from fastapi import HTTPException
from routers.change_review_undo import _resolve_old_data
from tests.conftest import insert_audit, insert_acknowledged_audit, insert_undone_audit


async def _insert_brand_update_audit(conn, brand_name: str, old_data_json=None,
                                     new_data_json=None):
    """Insert a brand row and an UPDATE audit entry; return (audit_id, brand_id)."""
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ($1) RETURNING brand_id", brand_name
    )
    cols = "table_name, record_id, operation, performed_by"
    vals = "$1, $2, 'UPDATE', 'admin'"
    params = ["brands", brand_id]
    if old_data_json is not None:
        cols += ", old_data"
        vals += f", ${len(params) + 1}"
        params.append(old_data_json)
    if new_data_json is not None:
        cols += ", new_data"
        vals += f", ${len(params) + 1}"
        params.append(new_data_json)
    row = await conn.fetchrow(
        f"INSERT INTO audit_log ({cols}) VALUES ({vals}) RETURNING audit_id", *params
    )
    return row["audit_id"], brand_id


async def test_undo_requires_admin(client, auth_headers, conn):
    audit_id, _ = await insert_audit(conn, operation="UPDATE")
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=auth_headers
    )
    assert response.status_code == 403


async def test_undo_returns_404_if_not_found(client, admin_headers):
    fake_id = "00000000-0000-0000-0000-000000000002"
    response = await client.post(
        f"/admin/change-review/{fake_id}/undo", headers=admin_headers
    )
    assert response.status_code == 404


async def test_undo_returns_409_if_already_acknowledged(client, admin_headers, conn):
    audit_id, _ = await insert_acknowledged_audit(conn, operation="UPDATE")
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    assert response.status_code == 409
    assert "already acknowledged" in response.json()["detail"]


async def test_undo_returns_409_if_already_undone(client, admin_headers, conn):
    audit_id, _ = await insert_undone_audit(conn, operation="UPDATE")
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    assert response.status_code == 409
    assert "already undone" in response.json()["detail"]


async def test_undo_create_soft_deletes_record(client, admin_headers, conn):
    """Undo a CREATE soft-deletes the record (sets deleted_at) rather than hard-deleting."""
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__undo_create__') RETURNING brand_id"
    )
    audit_id, _ = await insert_audit(conn, table="brands", operation="CREATE",
                                     record_id=brand_id)
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    assert response.status_code == 200
    row = await conn.fetchrow("SELECT deleted_at FROM brands WHERE brand_id = $1", brand_id)
    assert row is not None
    assert row["deleted_at"] is not None


async def test_undo_delete_unsets_deleted_at(client, admin_headers, conn):
    """Undo a DELETE restores the record (clears deleted_at)."""
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name, deleted_at) VALUES ('__undo_del__', NOW()) RETURNING brand_id"
    )
    audit_id, _ = await insert_audit(conn, table="brands", operation="DELETE",
                                     record_id=brand_id)
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    assert response.status_code == 200
    row = await conn.fetchrow("SELECT deleted_at FROM brands WHERE brand_id = $1", brand_id)
    assert row["deleted_at"] is None


async def test_undo_update_restores_old_data(client, admin_headers, conn):
    """Undo an UPDATE restores the brand_name from old_data."""
    audit_id, brand_id = await _insert_brand_update_audit(
        conn, "NewName", new_data_json="{}"
    )
    old = json.dumps({"brand_name": "OldName", "brand_id": str(brand_id)})
    await conn.execute(
        "UPDATE audit_log SET old_data = $1 WHERE audit_id = $2", old, audit_id
    )
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    assert response.status_code == 200
    row = await conn.fetchrow("SELECT brand_name FROM brands WHERE brand_id = $1", brand_id)
    assert row["brand_name"] == "OldName"


async def test_undo_update_returns_409_when_old_data_missing(client, admin_headers, conn):
    """Undo an UPDATE with no old_data returns 409 instead of silently no-oping."""
    audit_id, _ = await _insert_brand_update_audit(conn, "__undo_null_old__")
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    assert response.status_code == 409
    assert "old_data" in response.json()["detail"]


@pytest.mark.parametrize("bad_old_data", ['"a string"', "42", "[1,2,3]"],
                         ids=["string", "number", "array"])
async def test_undo_update_returns_409_when_old_data_not_a_dict(
    client, admin_headers, conn, bad_old_data
):
    """Undo an UPDATE whose old_data is valid JSON but not an object returns 409."""
    audit_id, _ = await _insert_brand_update_audit(conn, "__undo_bad_old__",
                                                   old_data_json=bad_old_data)
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    assert response.status_code == 409
    assert "old_data" in response.json()["detail"]


def test_resolve_old_data_returns_409_for_malformed_json():
    """_resolve_old_data raises 409 when given a string that is not valid JSON."""
    with pytest.raises(HTTPException) as exc_info:
        _resolve_old_data("{not valid json}")
    assert exc_info.value.status_code == 409
    assert "old_data" in exc_info.value.detail


async def test_undo_update_restores_old_data_with_parent_ids(client, admin_headers, conn):
    """Undo an UPDATE on an entity with parent_ids restores correctly without double-encoding."""
    effect_id = await conn.fetchval(
        "INSERT INTO effects (effect_name) VALUES ('NewName') RETURNING effect_id"
    )
    old_data = {"effect_id": str(effect_id), "effect_name": "OldName", "parent_ids": []}
    row = await conn.fetchrow(
        """INSERT INTO audit_log
               (table_name, record_id, operation, performed_by, old_data, new_data)
           VALUES ('effects', $1, 'UPDATE', 'admin', $2, '{}')
           RETURNING audit_id""",
        effect_id, json.dumps(old_data),
    )
    response = await client.post(
        f"/admin/change-review/{row['audit_id']}/undo", headers=admin_headers
    )
    assert response.status_code == 200
    row = await conn.fetchrow("SELECT effect_name FROM effects WHERE effect_id = $1", effect_id)
    assert row["effect_name"] == "OldName"


async def test_undo_sets_undone_fields(client, admin_headers, conn):
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__undo_fields__') RETURNING brand_id"
    )
    audit_id, _ = await insert_audit(conn, table="brands", operation="CREATE",
                                     record_id=brand_id)
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    data = response.json()
    assert data["undone_at"] is not None
    assert data["undone_by"] == "adminuser"


async def test_undo_create_soft_deletes_even_when_referenced(client, admin_headers, conn):
    """Undo CREATE soft-deletes the record even when it is referenced by other records."""
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__fk_test__') RETURNING brand_id"
    )
    await conn.execute(
        "INSERT INTO models (model_name, brand_id) VALUES ('__fk_model__', $1)", brand_id
    )
    audit_id, _ = await insert_audit(conn, table="brands", operation="CREATE",
                                     record_id=brand_id)
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    assert response.status_code == 200
    row = await conn.fetchrow("SELECT deleted_at FROM brands WHERE brand_id = $1", brand_id)
    assert row["deleted_at"] is not None


async def test_undo_does_not_create_new_audit_entry(client, admin_headers, conn):
    """Undoing an operation must not log a new audit_log entry."""
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__undo_no_log__') RETURNING brand_id"
    )
    audit_id, _ = await insert_audit(conn, table="brands", operation="CREATE",
                                     record_id=brand_id)
    count_before = await conn.fetchval("SELECT COUNT(*) FROM audit_log")
    await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    count_after = await conn.fetchval("SELECT COUNT(*) FROM audit_log")
    assert count_after == count_before
