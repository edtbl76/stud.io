import json
from uuid import uuid4


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

async def _insert_brand(conn, name="__hist_brand__"):
    return await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ($1) RETURNING brand_id", name
    )


async def _insert_effect(conn, brand_id, name="__hist_effect__"):
    return await conn.fetchval(
        "INSERT INTO effects (effect_name, brand_id) VALUES ($1, $2) RETURNING effect_id",
        name, brand_id,
    )


async def _insert_audit(conn, table, record_id, operation="UPDATE", old_data=None, new_data=None):
    return await conn.fetchval(
        """INSERT INTO audit_log (table_name, record_id, operation, performed_by, old_data, new_data)
           VALUES ($1, $2, $3, 'admin', $4, $5)
           RETURNING audit_id""",
        table, record_id, operation,
        json.dumps(old_data) if old_data is not None else None,
        json.dumps(new_data) if new_data is not None else None,
    )


# ---------------------------------------------------------------------------
# GET /effects/{id}/history — auth
# ---------------------------------------------------------------------------

async def test_history_requires_auth(client):
    response = await client.get(f"/effects/{uuid4()}/history")
    assert response.status_code == 401


async def test_history_accessible_by_regular_user(client, conn, auth_headers):
    brand_id = await _insert_brand(conn)
    effect_id = await _insert_effect(conn, brand_id)
    response = await client.get(f"/effects/{effect_id}/history", headers=auth_headers)
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# GET /effects/{id}/history — response shape
# ---------------------------------------------------------------------------

async def test_history_empty_for_no_audit_entries(client, conn, auth_headers):
    brand_id = await _insert_brand(conn)
    effect_id = await _insert_effect(conn, brand_id)
    response = await client.get(f"/effects/{effect_id}/history", headers=auth_headers)
    assert response.json() == []


async def test_history_returns_entries_sorted_desc(client, conn, auth_headers):
    brand_id = await _insert_brand(conn)
    effect_id = await _insert_effect(conn, brand_id)
    await _insert_audit(conn, "effects", effect_id, "CREATE", new_data={})
    await _insert_audit(conn, "effects", effect_id, "UPDATE", old_data={}, new_data={})
    response = await client.get(f"/effects/{effect_id}/history", headers=auth_headers)
    data = response.json()
    assert len(data) == 2
    times = [e["performed_at"] for e in data]
    assert times == sorted(times, reverse=True)


async def test_history_includes_old_and_new_data(client, conn, auth_headers):
    brand_id = await _insert_brand(conn)
    effect_id = await _insert_effect(conn, brand_id)
    await _insert_audit(
        conn, "effects", effect_id, "UPDATE",
        old_data={"effect_name": "Old"},
        new_data={"effect_name": "New"},
    )
    response = await client.get(f"/effects/{effect_id}/history", headers=auth_headers)
    entry = response.json()[0]
    assert entry["old_data"]["effect_name"] == "Old"
    assert entry["new_data"]["effect_name"] == "New"


async def test_history_null_old_data_for_create(client, conn, auth_headers):
    brand_id = await _insert_brand(conn)
    effect_id = await _insert_effect(conn, brand_id)
    await _insert_audit(conn, "effects", effect_id, "CREATE", new_data={"effect_name": "New"})
    response = await client.get(f"/effects/{effect_id}/history", headers=auth_headers)
    entry = response.json()[0]
    assert entry["old_data"] is None
    assert entry["new_data"] is not None


# ---------------------------------------------------------------------------
# GET /tools/{category}/{id}/history — resolves correct table
# ---------------------------------------------------------------------------

async def test_tools_history_resolves_workflow_table(client, conn, auth_headers):
    tool_id = await conn.fetchval(
        "INSERT INTO workflow_tools (tool_name) VALUES ('__hist_tool__') RETURNING workflow_tool_id"
    )
    await _insert_audit(conn, "workflow_tools", tool_id, "CREATE", new_data={})
    response = await client.get(f"/tools/workflow/{tool_id}/history", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["table_name"] == "workflow_tools"


# ---------------------------------------------------------------------------
# GET /config/{slug}/{id}/history — resolves correct table
# ---------------------------------------------------------------------------

async def test_config_history_resolves_effect_types_table(client, conn, auth_headers):
    type_id = await conn.fetchval(
        "INSERT INTO effect_types (type_name) VALUES ('__hist_etype__') RETURNING type_id"
    )
    await _insert_audit(conn, "effect_types", type_id, "CREATE", new_data={})
    response = await client.get(f"/config/effect-types/{type_id}/history", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["table_name"] == "effect_types"


# ---------------------------------------------------------------------------
# Display name resolution in GET /admin/change-review
# ---------------------------------------------------------------------------

async def test_change_review_populates_record_display_name_for_brand(client, conn, admin_headers):
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('HistoryBrand') RETURNING brand_id"
    )
    await _insert_audit(conn, "brands", brand_id, "UPDATE", old_data={}, new_data={})
    response = await client.get("/admin/change-review", headers=admin_headers)
    entries = response.json()["entries"]
    match = next((e for e in entries if str(e["record_id"]) == str(brand_id)), None)
    assert match is not None
    assert match["record_display_name"] == "HistoryBrand"


async def test_change_review_populates_record_display_name_for_config(client, conn, admin_headers):
    type_id = await conn.fetchval(
        "INSERT INTO effect_types (type_name) VALUES ('HistoryType') RETURNING type_id"
    )
    await _insert_audit(conn, "effect_types", type_id, "CREATE", new_data={})
    response = await client.get("/admin/change-review", headers=admin_headers)
    entries = response.json()["entries"]
    match = next((e for e in entries if str(e["record_id"]) == str(type_id)), None)
    assert match is not None
    assert match["record_display_name"] == "HistoryType"


async def test_change_review_display_name_fallback_for_hard_deleted_record(client, conn, admin_headers):
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('GoneForever') RETURNING brand_id"
    )
    await _insert_audit(conn, "brands", brand_id, "DELETE", old_data={})
    # Hard-delete the record so it no longer exists
    await conn.execute("DELETE FROM brands WHERE brand_id = $1", brand_id)
    response = await client.get("/admin/change-review", headers=admin_headers)
    entries = response.json()["entries"]
    match = next((e for e in entries if str(e["record_id"]) == str(brand_id)), None)
    assert match is not None
    assert match["record_display_name"] == str(brand_id)[:8]


async def test_change_review_display_name_resolves_soft_deleted_record(client, conn, admin_headers):
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('SoftDeleted') RETURNING brand_id"
    )
    await conn.execute("UPDATE brands SET deleted_at = NOW() WHERE brand_id = $1", brand_id)
    await _insert_audit(conn, "brands", brand_id, "DELETE", old_data={})
    response = await client.get("/admin/change-review", headers=admin_headers)
    entries = response.json()["entries"]
    match = next((e for e in entries if str(e["record_id"]) == str(brand_id)), None)
    assert match is not None
    # Soft-deleted record still in base table — name should resolve
    assert match["record_display_name"] == "SoftDeleted"
