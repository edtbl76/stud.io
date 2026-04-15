import uuid
import pytest
from datetime import datetime, timezone
from routers._helpers import AuditEntry, ChangeReviewResponse, _TABLE_PK


def test_audit_entry_model():
    entry = AuditEntry(
        audit_id=uuid.uuid4(),
        table_name="effects",
        record_id=uuid.uuid4(),
        operation="DELETE",
        performed_by="admin",
        performed_at=datetime.now(timezone.utc),
        acknowledged_at=None,
        acknowledged_by=None,
        undone_at=None,
        undone_by=None,
    )
    assert entry.record_display_name is None


def test_change_review_response_model():
    resp = ChangeReviewResponse(total=0, page=1, page_size=50, entries=[])
    assert resp.entries == []


def test_table_pk_covers_all_18_tables():
    expected = {
        "brands", "models",
        "effects", "instruments", "libraries", "workstations",
        "admin_tools", "composition_tools", "measurement_tools",
        "reference_tools", "workflow_tools",
        "effect_types", "entity_types", "instrument_types",
        "model_types", "plugin_formats", "tag_types", "tool_types",
    }
    assert set(_TABLE_PK.keys()) == expected


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _insert_audit(conn, table="brands", operation="DELETE", brand_id=None,
                        acknowledged_at=None, undone_at=None):
    """Insert a minimal audit_log entry and return its audit_id."""
    if brand_id is None:
        brand_id = await conn.fetchval(
            "INSERT INTO brands (brand_name) VALUES ('__audit_test__') RETURNING brand_id"
        )
    row = await conn.fetchrow(
        """INSERT INTO audit_log
               (table_name, record_id, operation, performed_by)
           VALUES ($1, $2, $3, $4)
           RETURNING audit_id""",
        table, brand_id, operation, "admin",
    )
    audit_id = row["audit_id"]

    if acknowledged_at:
        await conn.execute(
            "UPDATE audit_log SET acknowledged_at = NOW(), acknowledged_by = 'admin' WHERE audit_id = $1",
            audit_id,
        )
    if undone_at:
        await conn.execute(
            "UPDATE audit_log SET undone_at = NOW(), undone_by = 'admin' WHERE audit_id = $1",
            audit_id,
        )
    return audit_id, brand_id


# ---------------------------------------------------------------------------
# GET /admin/change-review
# ---------------------------------------------------------------------------

async def test_change_review_requires_auth(client):
    response = await client.get("/admin/change-review")
    assert response.status_code == 401


async def test_change_review_accessible_by_regular_user(client, auth_headers):
    """Regular users can read the change review list (read-only)."""
    response = await client.get("/admin/change-review", headers=auth_headers)
    assert response.status_code == 200


async def test_change_review_returns_pending_by_default(client, admin_headers, conn):
    audit_id, _ = await _insert_audit(conn, operation="DELETE")
    response = await client.get("/admin/change-review", headers=admin_headers)
    data = response.json()
    assert data["total"] >= 1
    ids = [e["audit_id"] for e in data["entries"]]
    assert str(audit_id) in ids


async def test_change_review_excludes_acknowledged_from_pending(client, admin_headers, conn):
    audit_id, _ = await _insert_audit(conn, operation="DELETE", acknowledged_at=True)
    response = await client.get("/admin/change-review", headers=admin_headers)
    data = response.json()
    ids = [e["audit_id"] for e in data["entries"]]
    assert str(audit_id) not in ids


async def test_change_review_status_all_includes_acknowledged(client, admin_headers, conn):
    audit_id, _ = await _insert_audit(conn, operation="DELETE", acknowledged_at=True)
    response = await client.get("/admin/change-review?status=all", headers=admin_headers)
    data = response.json()
    ids = [e["audit_id"] for e in data["entries"]]
    assert str(audit_id) in ids


async def test_change_review_filter_by_table(client, admin_headers, conn):
    brands_id, _ = await _insert_audit(conn, table="brands", operation="DELETE")
    # Insert an effects row and audit entry
    effect_id = await conn.fetchval(
        """INSERT INTO effects (effect_name, deleted_at)
           VALUES ('__fx_test__', NOW()) RETURNING effect_id"""
    )
    effects_id, _ = await _insert_audit(conn, table="effects", operation="DELETE",
                                         brand_id=effect_id)

    response = await client.get("/admin/change-review?table=brands", headers=admin_headers)
    data = response.json()
    ids = [e["audit_id"] for e in data["entries"]]
    assert str(brands_id) in ids
    assert str(effects_id) not in ids


async def test_change_review_filter_by_operation(client, admin_headers, conn):
    delete_id, _ = await _insert_audit(conn, operation="DELETE")
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__upd_test2__') RETURNING brand_id"
    )
    update_id, _ = await _insert_audit(conn, operation="UPDATE", brand_id=brand_id)

    response = await client.get("/admin/change-review?operation=DELETE", headers=admin_headers)
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
        await _insert_audit(conn, operation="CREATE", brand_id=brand_id)

    response = await client.get(
        "/admin/change-review?page=1&page_size=2", headers=admin_headers
    )
    data = response.json()
    assert len(data["entries"]) == 2
    assert data["total"] >= 3
    assert data["page"] == 1
    assert data["page_size"] == 2


async def test_change_review_response_shape(client, admin_headers, conn):
    """Response includes all required fields on each entry."""
    await _insert_audit(conn, operation="UPDATE")
    response = await client.get("/admin/change-review", headers=admin_headers)
    data = response.json()
    assert data["total"] >= 1
    entry = data["entries"][0]
    for field in ["audit_id", "table_name", "record_id", "operation",
                  "performed_by", "performed_at", "acknowledged_at",
                  "acknowledged_by", "undone_at", "undone_by", "record_display_name"]:
        assert field in entry


async def test_change_review_invalid_status_returns_422(client, admin_headers):
    response = await client.get("/admin/change-review?status=garbage", headers=admin_headers)
    assert response.status_code == 422


@pytest.mark.parametrize("params", [{"page": 0}, {"page_size": 0}])
async def test_change_review_invalid_page_params_return_422(client, admin_headers, params):
    resp = await client.get("/admin/change-review", params=params, headers=admin_headers)
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /admin/change-review/{audit_id}/acknowledge
# ---------------------------------------------------------------------------

async def test_acknowledge_requires_admin(client, auth_headers, conn):
    audit_id, _ = await _insert_audit(conn, operation="UPDATE")
    response = await client.post(
        f"/admin/change-review/{audit_id}/acknowledge", headers=auth_headers
    )
    assert response.status_code == 403


async def test_acknowledge_sets_acknowledged_fields(client, admin_headers, conn):
    audit_id, _ = await _insert_audit(conn, operation="UPDATE")
    response = await client.post(
        f"/admin/change-review/{audit_id}/acknowledge", headers=admin_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["acknowledged_at"] is not None
    assert data["acknowledged_by"] == "adminuser"


async def test_acknowledge_entry_no_longer_pending(client, admin_headers, conn):
    audit_id, _ = await _insert_audit(conn, operation="UPDATE")
    await client.post(
        f"/admin/change-review/{audit_id}/acknowledge", headers=admin_headers
    )
    pending = await client.get("/admin/change-review", headers=admin_headers)
    ids = [e["audit_id"] for e in pending.json()["entries"]]
    assert str(audit_id) not in ids


async def test_acknowledge_returns_404_if_not_found(client, admin_headers):
    fake_id = "00000000-0000-0000-0000-000000000001"
    response = await client.post(
        f"/admin/change-review/{fake_id}/acknowledge", headers=admin_headers
    )
    assert response.status_code == 404


async def test_acknowledge_returns_409_if_already_acknowledged(client, admin_headers, conn):
    audit_id, _ = await _insert_audit(conn, operation="UPDATE", acknowledged_at=True)
    response = await client.post(
        f"/admin/change-review/{audit_id}/acknowledge", headers=admin_headers
    )
    assert response.status_code == 409
    assert "already acknowledged" in response.json()["detail"]


async def test_acknowledge_returns_409_if_already_undone(client, admin_headers, conn):
    audit_id, _ = await _insert_audit(conn, operation="UPDATE", undone_at=True)
    response = await client.post(
        f"/admin/change-review/{audit_id}/acknowledge", headers=admin_headers
    )
    assert response.status_code == 409
    assert "already undone" in response.json()["detail"]


# ---------------------------------------------------------------------------
# POST /admin/change-review/{audit_id}/undo
# ---------------------------------------------------------------------------

async def test_undo_requires_admin(client, auth_headers, conn):
    audit_id, _ = await _insert_audit(conn, operation="UPDATE")
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
    audit_id, _ = await _insert_audit(conn, operation="UPDATE", acknowledged_at=True)
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    assert response.status_code == 409
    assert "already acknowledged" in response.json()["detail"]


async def test_undo_returns_409_if_already_undone(client, admin_headers, conn):
    audit_id, _ = await _insert_audit(conn, operation="UPDATE", undone_at=True)
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
    audit_id, _ = await _insert_audit(conn, table="brands", operation="CREATE",
                                       brand_id=brand_id)
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
    audit_id, _ = await _insert_audit(conn, table="brands", operation="DELETE",
                                       brand_id=brand_id)
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    assert response.status_code == 200
    row = await conn.fetchrow("SELECT deleted_at FROM brands WHERE brand_id = $1", brand_id)
    assert row["deleted_at"] is None


async def test_undo_update_restores_old_data(client, admin_headers, conn):
    """Undo an UPDATE restores the brand_name from old_data."""
    import json as _json
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('NewName') RETURNING brand_id"
    )
    old_data = {"brand_name": "OldName", "brand_id": str(brand_id)}
    row = await conn.fetchrow(
        """INSERT INTO audit_log
               (table_name, record_id, operation, performed_by, old_data, new_data)
           VALUES ('brands', $1, 'UPDATE', 'admin', $2, '{}')
           RETURNING audit_id""",
        brand_id, _json.dumps(old_data),
    )
    audit_id = row["audit_id"]
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    assert response.status_code == 200
    row = await conn.fetchrow("SELECT brand_name FROM brands WHERE brand_id = $1", brand_id)
    assert row["brand_name"] == "OldName"


async def test_undo_update_returns_409_when_old_data_missing(client, admin_headers, conn):
    """Undo an UPDATE with no old_data returns 409 instead of silently no-oping."""
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__undo_null_old__') RETURNING brand_id"
    )
    row = await conn.fetchrow(
        """INSERT INTO audit_log
               (table_name, record_id, operation, performed_by)
           VALUES ('brands', $1, 'UPDATE', 'admin')
           RETURNING audit_id""",
        brand_id,
    )
    response = await client.post(
        f"/admin/change-review/{row['audit_id']}/undo", headers=admin_headers
    )
    assert response.status_code == 409
    assert "old_data" in response.json()["detail"]


@pytest.mark.parametrize("bad_old_data", ['"a string"', "42", "[1,2,3]"],
                         ids=["string", "number", "array"])
async def test_undo_update_returns_409_when_old_data_not_a_dict(client, admin_headers, conn, bad_old_data):
    """Undo an UPDATE whose old_data is valid JSON but not an object returns 409."""
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__undo_bad_old__') RETURNING brand_id"
    )
    row = await conn.fetchrow(
        """INSERT INTO audit_log
               (table_name, record_id, operation, performed_by, old_data)
           VALUES ('brands', $1, 'UPDATE', 'admin', $2)
           RETURNING audit_id""",
        brand_id, bad_old_data,
    )
    response = await client.post(
        f"/admin/change-review/{row['audit_id']}/undo", headers=admin_headers
    )
    assert response.status_code == 409
    assert "old_data" in response.json()["detail"]


def test_resolve_old_data_returns_409_for_malformed_json():
    """_resolve_old_data raises 409 when given a string that is not valid JSON."""
    from fastapi import HTTPException as _HTTPException
    from routers.change_review_undo import _resolve_old_data
    with pytest.raises(_HTTPException) as exc_info:
        _resolve_old_data("{not valid json}")
    assert exc_info.value.status_code == 409
    assert "old_data" in exc_info.value.detail


async def test_undo_update_restores_old_data_with_parent_ids(client, admin_headers, conn):
    """Undo an UPDATE on an entity with parent_ids restores correctly without double-encoding."""
    import json as _json
    effect_id = await conn.fetchval(
        "INSERT INTO effects (effect_name) VALUES ('NewName') RETURNING effect_id"
    )
    old_data = {
        "effect_id": str(effect_id),
        "effect_name": "OldName",
        "parent_ids": [],
    }
    row = await conn.fetchrow(
        """INSERT INTO audit_log
               (table_name, record_id, operation, performed_by, old_data, new_data)
           VALUES ('effects', $1, 'UPDATE', 'admin', $2, '{}')
           RETURNING audit_id""",
        effect_id, _json.dumps(old_data),
    )
    audit_id = row["audit_id"]
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    assert response.status_code == 200
    row = await conn.fetchrow("SELECT effect_name FROM effects WHERE effect_id = $1", effect_id)
    assert row["effect_name"] == "OldName"


async def test_undo_sets_undone_fields(client, admin_headers, conn):
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__undo_fields__') RETURNING brand_id"
    )
    audit_id, _ = await _insert_audit(conn, table="brands", operation="CREATE",
                                       brand_id=brand_id)
    response = await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    data = response.json()
    assert data["undone_at"] is not None
    assert data["undone_by"] == "adminuser"


async def test_undo_create_soft_deletes_even_when_referenced(client, admin_headers, conn):
    """Undo CREATE soft-deletes the record even when it is referenced by other records.

    Soft-delete does not violate FK constraints — the row remains in the DB so
    referencing records are unaffected.  Hard-delete would fail with 409; soft-delete succeeds.
    """
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__fk_test__') RETURNING brand_id"
    )
    await conn.execute(
        "INSERT INTO models (model_name, brand_id) VALUES ('__fk_model__', $1)", brand_id
    )
    audit_id, _ = await _insert_audit(conn, table="brands", operation="CREATE",
                                       brand_id=brand_id)
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
    audit_id, _ = await _insert_audit(conn, table="brands", operation="CREATE",
                                       brand_id=brand_id)
    count_before = await conn.fetchval("SELECT COUNT(*) FROM audit_log")
    await client.post(
        f"/admin/change-review/{audit_id}/undo", headers=admin_headers
    )
    count_after = await conn.fetchval("SELECT COUNT(*) FROM audit_log")
    assert count_after == count_before  # no new entry


# ---------------------------------------------------------------------------
# DELETE /admin/change-review/{audit_id}/permanent
# ---------------------------------------------------------------------------

async def test_permanent_requires_admin(client, auth_headers, conn):
    audit_id, _ = await _insert_audit(conn, operation="DELETE")
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
    audit_id, _ = await _insert_audit(conn, table="brands", operation="UPDATE",
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
    audit_id, _ = await _insert_audit(conn, table="brands", operation="DELETE",
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
    audit_id, _ = await _insert_audit(conn, table="brands", operation="DELETE",
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
    audit_id, brand_id = await _insert_audit(conn, operation="DELETE", acknowledged_at=True)
    response = await client.delete(
        f"/admin/change-review/{audit_id}/permanent", headers=admin_headers
    )
    assert response.status_code == 409
    assert "already acknowledged" in response.json()["detail"]


async def test_permanent_returns_409_if_already_undone(client, admin_headers, conn):
    audit_id, _ = await _insert_audit(conn, operation="DELETE", undone_at=True)
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
    audit_id, _ = await _insert_audit(conn, table="brands", operation="DELETE",
                                       brand_id=brand_id)
    response = await client.delete(
        f"/admin/change-review/{audit_id}/permanent", headers=admin_headers
    )
    assert response.status_code == 409
    assert "referenced" in response.json()["detail"]


# ---------------------------------------------------------------------------
# GET /admin/change-review/{audit_id}
# ---------------------------------------------------------------------------

async def test_get_detail_requires_auth(client, conn):
    audit_id, _ = await _insert_audit(conn, operation="UPDATE")
    response = await client.get(f"/admin/change-review/{audit_id}")
    assert response.status_code == 401


async def test_get_detail_accessible_by_regular_user(client, auth_headers, conn):
    audit_id, _ = await _insert_audit(conn, operation="UPDATE")
    response = await client.get(f"/admin/change-review/{audit_id}", headers=auth_headers)
    assert response.status_code == 200


async def test_get_detail_returns_404_if_not_found(client, auth_headers):
    fake_id = "00000000-0000-0000-0000-000000000099"
    response = await client.get(f"/admin/change-review/{fake_id}", headers=auth_headers)
    assert response.status_code == 404


async def test_get_detail_includes_old_and_new_data(client, auth_headers, conn):
    """Detail endpoint returns old_data and new_data fields."""
    import json as _json
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
        brand_id, _json.dumps(old), _json.dumps(new),
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
    audit_id, _ = await _insert_audit(conn, operation="CREATE")
    response = await client.get(f"/admin/change-review/{audit_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["old_data"] is None
