"""Tests for the audit infrastructure: schema, soft-delete, and audit logging."""
import pytest
from uuid import UUID as PyUUID
from datetime import datetime as PyDatetime
from routers._helpers import _serializable


# ---------------------------------------------------------------------------
# SCHEMA VERIFICATION
# ---------------------------------------------------------------------------

async def test_audit_log_table_exists(conn):
    row = await conn.fetchrow(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_name = 'audit_log'"
    )
    assert row is not None, "audit_log table does not exist"


async def test_audit_log_check_constraint(conn):
    """Mutual-exclusivity constraint prevents both ack and undo being set."""
    row = await conn.fetchrow(
        """
        INSERT INTO audit_log (table_name, record_id, operation, performed_by)
        VALUES ('brands', gen_random_uuid(), 'CREATE', 'test')
        RETURNING audit_id
        """
    )
    # Setting both acknowledged_at and undone_at should violate CHECK constraint
    with pytest.raises(Exception, match="audit_log_state_exclusive"):
        await conn.execute(
            "UPDATE audit_log SET acknowledged_at = NOW(), undone_at = NOW() "
            "WHERE audit_id = $1",
            row["audit_id"],
        )


async def test_deleted_at_column_exists_brands(conn):
    row = await conn.fetchrow(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'brands' AND column_name = 'deleted_at'"
    )
    assert row is not None, "brands.deleted_at column does not exist"


async def test_deleted_at_column_exists_all_18_tables(conn):
    tables = [
        "brands", "models", "effects", "instruments", "libraries", "workstations",
        "admin_tools", "composition_tools", "measurement_tools",
        "reference_tools", "workflow_tools",
        "effect_types", "entity_types", "instrument_types",
        "model_types", "plugin_formats", "tag_types", "tool_types",
    ]
    for table in tables:
        row = await conn.fetchrow(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = $1 AND column_name = 'deleted_at'",
            table,
        )
        assert row is not None, f"{table}.deleted_at column does not exist"


# ---------------------------------------------------------------------------
# VIEW FILTERING — soft-deleted records excluded
# ---------------------------------------------------------------------------

async def test_soft_deleted_brand_excluded_from_list(client, conn, admin_headers):
    # Create a brand, soft-delete it, verify it's gone from list
    r = await client.post("/brands", json={"brand_name": "GhostBrand"}, headers=admin_headers)
    assert r.status_code == 201
    brand_id = r.json()["brand_id"]

    await conn.execute("UPDATE brands SET deleted_at = NOW() WHERE brand_id = $1", brand_id)

    r = await client.get("/brands")
    ids = [b["brand_id"] for b in r.json()["items"]]
    assert brand_id not in ids, "Soft-deleted brand should not appear in list"


async def test_soft_deleted_brand_returns_404_on_get(client, conn, admin_headers):
    r = await client.post("/brands", json={"brand_name": "GhostBrand2"}, headers=admin_headers)
    assert r.status_code == 201
    brand_id = r.json()["brand_id"]

    await conn.execute("UPDATE brands SET deleted_at = NOW() WHERE brand_id = $1", brand_id)

    r = await client.get(f"/brands/{brand_id}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# _serializable HELPER
# ---------------------------------------------------------------------------


def test_serializable_converts_uuid():
    uid = PyUUID("12345678-1234-5678-1234-567812345678")
    result = _serializable({"id": uid})
    assert result == {"id": "12345678-1234-5678-1234-567812345678"}


def test_serializable_converts_datetime():
    dt = PyDatetime(2026, 1, 1, 12, 0, 0)
    result = _serializable({"ts": dt})
    assert result["ts"] == str(dt)


def test_serializable_handles_list_of_uuids():
    uid = PyUUID("12345678-1234-5678-1234-567812345678")
    result = _serializable({"ids": [uid]})
    assert result == {"ids": ["12345678-1234-5678-1234-567812345678"]}


def test_serializable_handles_none_in_list():
    result = _serializable({"ids": [None]})
    assert result == {"ids": [None]}


def test_serializable_handles_nested_dict_jsonb():
    """JSONB column already decoded by asyncpg codec comes back as dict."""
    result = _serializable({"attrs": {"key": "value"}})
    assert result == {"attrs": {"key": "value"}}


def test_serializable_handles_none_value():
    result = _serializable({"deleted_at": None})
    assert result == {"deleted_at": None}


def test_serializable_handles_nested_list_in_jsonb():
    """JSONB column containing a list of UUIDs must serialize correctly."""
    uid = PyUUID("12345678-1234-5678-1234-567812345678")
    result = _serializable({"attrs": {"ids": [uid]}})
    assert result == {"attrs": {"ids": ["12345678-1234-5678-1234-567812345678"]}}


# ---------------------------------------------------------------------------
# EFFECTS — audit logging + soft-delete
# ---------------------------------------------------------------------------

async def test_create_effect_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/effects", json={"effect_name": "AuditEQ"}, headers=admin_headers)
    assert r.status_code == 201
    effect_id = r.json()["effect_id"]

    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='effects' AND record_id=$1", effect_id
    )
    assert row is not None
    assert row["operation"] == "CREATE"
    assert row["performed_by"] == "adminuser"
    assert row["old_data"] is None
    new_data = row["new_data"]
    assert new_data["effect_name"] == "AuditEQ"


async def test_update_effect_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/effects", json={"effect_name": "AuditEQ2"}, headers=admin_headers)
    effect_id = r.json()["effect_id"]

    await client.patch(f"/effects/{effect_id}", json={"version": "2.0"}, headers=admin_headers)

    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='effects' AND record_id=$1 AND operation='UPDATE'",
        effect_id,
    )
    assert row is not None
    assert row["old_data"]["version"] is None
    assert row["new_data"]["version"] == "2.0"


async def test_delete_effect_soft_deletes(client, conn, admin_headers):
    r = await client.post("/effects", json={"effect_name": "ToDelete"}, headers=admin_headers)
    effect_id = r.json()["effect_id"]

    r = await client.delete(f"/effects/{effect_id}", headers=admin_headers)
    assert r.status_code == 204

    row = await conn.fetchrow("SELECT deleted_at FROM effects WHERE effect_id=$1", effect_id)
    assert row is not None, "Record should still exist (soft-deleted)"
    assert row["deleted_at"] is not None, "deleted_at should be set"


async def test_delete_effect_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/effects", json={"effect_name": "ToDelete2"}, headers=admin_headers)
    effect_id = r.json()["effect_id"]

    await client.delete(f"/effects/{effect_id}", headers=admin_headers)

    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='effects' AND record_id=$1 AND operation='DELETE'",
        effect_id,
    )
    assert row is not None
    assert row["new_data"] is None
    assert row["old_data"]["effect_name"] == "ToDelete2"


async def test_delete_already_deleted_effect_returns_200(client, conn, admin_headers):
    r = await client.post("/effects", json={"effect_name": "AlreadyGone"}, headers=admin_headers)
    effect_id = r.json()["effect_id"]
    await conn.execute("UPDATE effects SET deleted_at = NOW() WHERE effect_id=$1", effect_id)

    r = await client.delete(f"/effects/{effect_id}", headers=admin_headers)
    assert r.status_code == 200
    assert "already deleted" in r.json()["detail"]

    # No DELETE audit entry written (CREATE entry from POST may exist)
    count = await conn.fetchval(
        "SELECT COUNT(*) FROM audit_log WHERE table_name='effects' AND record_id=$1 AND operation='DELETE'",
        effect_id,
    )
    assert count == 0


async def test_patch_soft_deleted_effect_returns_409(client, conn, admin_headers):
    r = await client.post("/effects", json={"effect_name": "SoftDel"}, headers=admin_headers)
    effect_id = r.json()["effect_id"]
    await conn.execute("UPDATE effects SET deleted_at = NOW() WHERE effect_id=$1", effect_id)

    r = await client.patch(f"/effects/{effect_id}", json={"version": "x"}, headers=admin_headers)
    assert r.status_code == 409
    assert "deleted" in r.json()["detail"]


async def test_create_effect_audit_serializes_parent_ids(client, conn, admin_headers):
    """parent_ids composite array must serialize to [{table_name, id}] in audit."""
    # Create a parent effect first
    r = await client.post("/effects", json={"effect_name": "Parent"}, headers=admin_headers)
    parent_id = r.json()["effect_id"]

    r = await client.post("/effects", json={
        "effect_name": "Child",
        "parent_ids": [{"table_name": "effects", "id": parent_id}],
    }, headers=admin_headers)
    assert r.status_code == 201
    child_id = r.json()["effect_id"]

    row = await conn.fetchrow(
        "SELECT new_data FROM audit_log WHERE table_name='effects' AND record_id=$1", child_id
    )
    parent_ids = row["new_data"]["parent_ids"]
    assert len(parent_ids) == 1
    assert parent_ids[0]["table_name"] == "effects"
    assert parent_ids[0]["id"] == parent_id


# ---------------------------------------------------------------------------
# INSTRUMENTS — audit logging + soft-delete (same pattern as effects)
# ---------------------------------------------------------------------------

async def test_create_instrument_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/instruments", json={"instrument_name": "AuditPiano"}, headers=admin_headers)
    assert r.status_code == 201
    instrument_id = r.json()["instrument_id"]
    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='instruments' AND record_id=$1", instrument_id
    )
    assert row is not None
    assert row["operation"] == "CREATE"


async def test_delete_instrument_soft_deletes(client, conn, admin_headers):
    r = await client.post("/instruments", json={"instrument_name": "ToDelete"}, headers=admin_headers)
    instrument_id = r.json()["instrument_id"]
    r = await client.delete(f"/instruments/{instrument_id}", headers=admin_headers)
    assert r.status_code == 204
    row = await conn.fetchrow("SELECT deleted_at FROM instruments WHERE instrument_id=$1", instrument_id)
    assert row["deleted_at"] is not None


async def test_patch_soft_deleted_instrument_returns_409(client, conn, admin_headers):
    r = await client.post("/instruments", json={"instrument_name": "SoftDel"}, headers=admin_headers)
    instrument_id = r.json()["instrument_id"]
    await conn.execute("UPDATE instruments SET deleted_at = NOW() WHERE instrument_id=$1", instrument_id)
    r = await client.patch(f"/instruments/{instrument_id}", json={"version": "x"}, headers=admin_headers)
    assert r.status_code == 409


async def test_delete_instrument_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/instruments", json={"instrument_name": "AuditDelete"}, headers=admin_headers)
    instrument_id = r.json()["instrument_id"]

    await client.delete(f"/instruments/{instrument_id}", headers=admin_headers)

    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='instruments' AND record_id=$1 AND operation='DELETE'",
        instrument_id,
    )
    assert row is not None
    assert row["new_data"] is None
    assert row["old_data"]["instrument_name"] == "AuditDelete"


async def test_delete_already_deleted_instrument_returns_200(client, conn, admin_headers):
    r = await client.post("/instruments", json={"instrument_name": "AlreadyGone"}, headers=admin_headers)
    instrument_id = r.json()["instrument_id"]
    await conn.execute("UPDATE instruments SET deleted_at = NOW() WHERE instrument_id=$1", instrument_id)

    r = await client.delete(f"/instruments/{instrument_id}", headers=admin_headers)
    assert r.status_code == 200
    assert "already deleted" in r.json()["detail"]

    count = await conn.fetchval(
        "SELECT COUNT(*) FROM audit_log WHERE table_name='instruments' AND record_id=$1 AND operation='DELETE'",
        instrument_id,
    )
    assert count == 0


# ---------------------------------------------------------------------------
# LIBRARIES — audit logging + soft-delete
# ---------------------------------------------------------------------------

async def test_create_library_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/libraries", json={"library_name": "AuditLib"}, headers=admin_headers)
    assert r.status_code == 201
    library_id = r.json()["library_id"]
    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='libraries' AND record_id=$1", library_id
    )
    assert row is not None
    assert row["operation"] == "CREATE"


async def test_delete_library_soft_deletes(client, conn, admin_headers):
    r = await client.post("/libraries", json={"library_name": "ToDelete"}, headers=admin_headers)
    library_id = r.json()["library_id"]
    r = await client.delete(f"/libraries/{library_id}", headers=admin_headers)
    assert r.status_code == 204
    row = await conn.fetchrow("SELECT deleted_at FROM libraries WHERE library_id=$1", library_id)
    assert row["deleted_at"] is not None


# ---------------------------------------------------------------------------
# BRANDS — simple columns, no parent_ids
# ---------------------------------------------------------------------------

async def test_create_brand_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/brands", json={"brand_name": "AuditBrand"}, headers=admin_headers)
    assert r.status_code == 201
    brand_id = r.json()["brand_id"]

    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='brands' AND record_id=$1", brand_id
    )
    assert row is not None
    assert row["operation"] == "CREATE"
    assert row["old_data"] is None
    assert row["new_data"]["brand_name"] == "AuditBrand"


async def test_update_brand_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/brands", json={"brand_name": "BeforeUpdate"}, headers=admin_headers)
    brand_id = r.json()["brand_id"]

    await client.patch(f"/brands/{brand_id}", json={"brand_name": "AfterUpdate"}, headers=admin_headers)

    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='brands' AND record_id=$1 AND operation='UPDATE'",
        brand_id,
    )
    assert row is not None
    assert row["old_data"]["brand_name"] == "BeforeUpdate"
    assert row["new_data"]["brand_name"] == "AfterUpdate"


async def test_delete_brand_soft_deletes(client, conn, admin_headers):
    r = await client.post("/brands", json={"brand_name": "ToSoftDelete"}, headers=admin_headers)
    brand_id = r.json()["brand_id"]

    r = await client.delete(f"/brands/{brand_id}", headers=admin_headers)
    assert r.status_code == 204

    row = await conn.fetchrow("SELECT deleted_at FROM brands WHERE brand_id=$1", brand_id)
    assert row["deleted_at"] is not None


async def test_delete_brand_not_soft_deleted_if_has_active_model_ref(client, conn, admin_headers):
    """Brands with active (non-deleted) model children cannot be soft-deleted."""
    rb = await client.post("/brands", json={"brand_name": "RefBrand"}, headers=admin_headers)
    brand_id = rb.json()["brand_id"]
    await client.post("/models", json={"model_name": "RefModel", "brand_id": brand_id}, headers=admin_headers)

    r = await client.delete(f"/brands/{brand_id}", headers=admin_headers)
    assert r.status_code == 409


async def test_patch_soft_deleted_brand_returns_409(client, conn, admin_headers):
    r = await client.post("/brands", json={"brand_name": "SoftBrand"}, headers=admin_headers)
    brand_id = r.json()["brand_id"]
    await conn.execute("UPDATE brands SET deleted_at = NOW() WHERE brand_id=$1", brand_id)

    r = await client.patch(f"/brands/{brand_id}", json={"brand_name": "x"}, headers=admin_headers)
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# MODELS — has attributes JSONB, _REF_CHECKS (model_ids array)
# ---------------------------------------------------------------------------

async def test_create_model_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/models", json={"model_name": "AuditModel"}, headers=admin_headers)
    assert r.status_code == 201
    model_id = r.json()["model_id"]
    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='models' AND record_id=$1", model_id
    )
    assert row is not None
    assert row["operation"] == "CREATE"


async def test_delete_model_soft_deletes(client, conn, admin_headers):
    r = await client.post("/models", json={"model_name": "ToDelete"}, headers=admin_headers)
    model_id = r.json()["model_id"]
    r = await client.delete(f"/models/{model_id}", headers=admin_headers)
    assert r.status_code == 204
    row = await conn.fetchrow("SELECT deleted_at FROM models WHERE model_id=$1", model_id)
    assert row["deleted_at"] is not None


async def test_update_model_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/models", json={"model_name": "BeforeUpdate"}, headers=admin_headers)
    assert r.status_code == 201
    model_id = r.json()["model_id"]

    await client.patch(f"/models/{model_id}", json={"model_name": "AfterUpdate"}, headers=admin_headers)

    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='models' AND record_id=$1 AND operation='UPDATE'",
        model_id,
    )
    assert row is not None
    assert row["old_data"]["model_name"] == "BeforeUpdate"
    assert row["new_data"]["model_name"] == "AfterUpdate"


async def test_delete_model_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/models", json={"model_name": "ToAuditDelete"}, headers=admin_headers)
    assert r.status_code == 201
    model_id = r.json()["model_id"]

    await client.delete(f"/models/{model_id}", headers=admin_headers)

    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='models' AND record_id=$1 AND operation='DELETE'",
        model_id,
    )
    assert row is not None
    assert row["new_data"] is None
    assert row["old_data"]["model_name"] == "ToAuditDelete"


async def test_patch_soft_deleted_model_returns_409(client, conn, admin_headers):
    r = await client.post("/models", json={"model_name": "SoftDelModel"}, headers=admin_headers)
    assert r.status_code == 201
    model_id = r.json()["model_id"]
    await conn.execute("UPDATE models SET deleted_at = NOW() WHERE model_id=$1", model_id)

    r = await client.patch(f"/models/{model_id}", json={"model_name": "x"}, headers=admin_headers)
    assert r.status_code == 409
    assert "deleted" in r.json()["detail"]


async def test_delete_already_deleted_model_returns_200(client, conn, admin_headers):
    r = await client.post("/models", json={"model_name": "AlreadyGoneModel"}, headers=admin_headers)
    assert r.status_code == 201
    model_id = r.json()["model_id"]
    await conn.execute("UPDATE models SET deleted_at = NOW() WHERE model_id=$1", model_id)

    r = await client.delete(f"/models/{model_id}", headers=admin_headers)
    assert r.status_code == 200
    assert "already deleted" in r.json()["detail"]

    count = await conn.fetchval(
        "SELECT COUNT(*) FROM audit_log WHERE table_name='models' AND record_id=$1 AND operation='DELETE'",
        model_id,
    )
    assert count == 0


async def test_delete_model_blocked_by_ref_check(client, conn, admin_headers):
    r = await client.post("/models", json={"model_name": "RefModel"}, headers=admin_headers)
    assert r.status_code == 201
    model_id = r.json()["model_id"]

    r = await client.post(
        "/effects",
        json={"effect_name": "RefEffect", "model_ids": [str(model_id)]},
        headers=admin_headers,
    )
    assert r.status_code == 201

    r = await client.delete(f"/models/{model_id}", headers=admin_headers)
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# WORKSTATIONS — simplest router, no refcheck, no JSONB attributes
# ---------------------------------------------------------------------------

async def test_create_workstation_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/workstations", json={"tool_name": "AuditDAW"}, headers=admin_headers)
    assert r.status_code == 201
    workstation_id = r.json()["workstation_id"]
    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='workstations' AND record_id=$1", workstation_id
    )
    assert row is not None
    assert row["operation"] == "CREATE"


async def test_delete_workstation_soft_deletes(client, conn, admin_headers):
    r = await client.post("/workstations", json={"tool_name": "ToDelete"}, headers=admin_headers)
    workstation_id = r.json()["workstation_id"]
    r = await client.delete(f"/workstations/{workstation_id}", headers=admin_headers)
    assert r.status_code == 204
    row = await conn.fetchrow("SELECT deleted_at FROM workstations WHERE workstation_id=$1", workstation_id)
    assert row["deleted_at"] is not None


async def test_patch_soft_deleted_workstation_returns_409(client, conn, admin_headers):
    r = await client.post("/workstations", json={"tool_name": "SoftDel"}, headers=admin_headers)
    workstation_id = r.json()["workstation_id"]
    await conn.execute("UPDATE workstations SET deleted_at = NOW() WHERE workstation_id=$1", workstation_id)
    r = await client.patch(f"/workstations/{workstation_id}", json={"version": "x"}, headers=admin_headers)
    assert r.status_code == 409


async def test_update_workstation_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/workstations", json={"tool_name": "BeforeUpdate"}, headers=admin_headers)
    workstation_id = r.json()["workstation_id"]
    await client.patch(f"/workstations/{workstation_id}", json={"tool_name": "AfterUpdate"}, headers=admin_headers)
    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='workstations' AND record_id=$1 AND operation='UPDATE'",
        workstation_id,
    )
    assert row is not None
    assert row["old_data"]["tool_name"] == "BeforeUpdate"
    assert row["new_data"]["tool_name"] == "AfterUpdate"


async def test_delete_workstation_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/workstations", json={"tool_name": "ToAuditDelete"}, headers=admin_headers)
    workstation_id = r.json()["workstation_id"]
    await client.delete(f"/workstations/{workstation_id}", headers=admin_headers)
    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='workstations' AND record_id=$1 AND operation='DELETE'",
        workstation_id,
    )
    assert row is not None
    assert row["new_data"] is None
    assert row["old_data"]["tool_name"] == "ToAuditDelete"


async def test_delete_already_deleted_workstation_returns_200(client, conn, admin_headers):
    r = await client.post("/workstations", json={"tool_name": "AlreadyDeleted"}, headers=admin_headers)
    workstation_id = r.json()["workstation_id"]
    await conn.execute("UPDATE workstations SET deleted_at = NOW() WHERE workstation_id=$1", workstation_id)
    r = await client.delete(f"/workstations/{workstation_id}", headers=admin_headers)
    assert r.status_code == 200
    assert "already deleted" in r.json()["detail"]
    count = await conn.fetchval(
        "SELECT COUNT(*) FROM audit_log WHERE table_name='workstations' AND record_id=$1 AND operation='DELETE'",
        workstation_id,
    )
    assert count == 0


# ---------------------------------------------------------------------------
# TOOLS — 5 categories, spec tests workflow specifically
# ---------------------------------------------------------------------------

async def test_create_tool_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/tools/workflow", json={"tool_name": "AuditTool"}, headers=admin_headers)
    assert r.status_code == 201
    tool_id = r.json()["tool_id"]

    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='workflow_tools' AND record_id=$1", tool_id
    )
    assert row is not None
    assert row["operation"] == "CREATE"
    assert row["new_data"]["tool_name"] == "AuditTool"


async def test_delete_tool_soft_deletes(client, conn, admin_headers):
    r = await client.post("/tools/workflow", json={"tool_name": "ToDelete"}, headers=admin_headers)
    tool_id = r.json()["tool_id"]
    r = await client.delete(f"/tools/workflow/{tool_id}", headers=admin_headers)
    assert r.status_code == 204
    row = await conn.fetchrow("SELECT deleted_at FROM workflow_tools WHERE workflow_tool_id=$1", tool_id)
    assert row["deleted_at"] is not None


async def test_patch_soft_deleted_tool_returns_409(client, conn, admin_headers):
    r = await client.post("/tools/workflow", json={"tool_name": "SoftDel"}, headers=admin_headers)
    tool_id = r.json()["tool_id"]
    await conn.execute("UPDATE workflow_tools SET deleted_at = NOW() WHERE workflow_tool_id=$1", tool_id)
    r = await client.patch(f"/tools/workflow/{tool_id}", json={"version": "x"}, headers=admin_headers)
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# CONFIG — 7 lookup tables, spec tests effect-types specifically
# ---------------------------------------------------------------------------

async def test_create_config_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/config/effect-types", json={"type_name": "AuditType"}, headers=admin_headers)
    assert r.status_code == 201
    type_id = r.json()["type_id"]

    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='effect_types' AND record_id=$1", type_id
    )
    assert row is not None
    assert row["operation"] == "CREATE"
    assert row["new_data"]["type_name"] == "AuditType"


async def test_delete_config_soft_deletes(client, conn, admin_headers):
    r = await client.post("/config/effect-types", json={"type_name": "ToDelete"}, headers=admin_headers)
    type_id = r.json()["type_id"]
    r = await client.delete(f"/config/effect-types/{type_id}", headers=admin_headers)
    assert r.status_code == 204
    row = await conn.fetchrow("SELECT deleted_at FROM effect_types WHERE type_id=$1", type_id)
    assert row["deleted_at"] is not None


async def test_soft_deleted_config_excluded_from_list(client, conn, admin_headers):
    r = await client.post("/config/effect-types", json={"type_name": "GhostType"}, headers=admin_headers)
    type_id = r.json()["type_id"]
    await conn.execute("UPDATE effect_types SET deleted_at = NOW() WHERE type_id=$1", type_id)

    r = await client.get("/config/effect-types")
    ids = [t["type_id"] for t in r.json()]
    assert type_id not in ids


async def test_soft_deleted_config_returns_404_on_get(client, conn, admin_headers):
    r = await client.post("/config/effect-types", json={"type_name": "GhostType2"}, headers=admin_headers)
    type_id = r.json()["type_id"]
    await conn.execute("UPDATE effect_types SET deleted_at = NOW() WHERE type_id=$1", type_id)

    r = await client.get(f"/config/effect-types/{type_id}")
    assert r.status_code == 404


async def test_patch_soft_deleted_config_returns_409(client, conn, admin_headers):
    r = await client.post("/config/effect-types", json={"type_name": "SoftType"}, headers=admin_headers)
    type_id = r.json()["type_id"]
    await conn.execute("UPDATE effect_types SET deleted_at = NOW() WHERE type_id=$1", type_id)

    r = await client.patch(f"/config/effect-types/{type_id}", json={"type_name": "x"}, headers=admin_headers)
    assert r.status_code == 409


async def test_update_config_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/config/effect-types", json={"type_name": "BeforeUpdate"}, headers=admin_headers)
    type_id = r.json()["type_id"]
    await client.patch(f"/config/effect-types/{type_id}", json={"type_name": "AfterUpdate"}, headers=admin_headers)
    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='effect_types' AND record_id=$1 AND operation='UPDATE'",
        type_id,
    )
    assert row is not None
    assert row["old_data"]["type_name"] == "BeforeUpdate"
    assert row["new_data"]["type_name"] == "AfterUpdate"


async def test_delete_config_writes_audit_entry(client, conn, admin_headers):
    r = await client.post("/config/effect-types", json={"type_name": "ToAuditDelete"}, headers=admin_headers)
    type_id = r.json()["type_id"]
    await client.delete(f"/config/effect-types/{type_id}", headers=admin_headers)
    row = await conn.fetchrow(
        "SELECT * FROM audit_log WHERE table_name='effect_types' AND record_id=$1 AND operation='DELETE'",
        type_id,
    )
    assert row is not None
    assert row["new_data"] is None
    assert row["old_data"]["type_name"] == "ToAuditDelete"


async def test_delete_config_already_deleted_returns_200(client, conn, admin_headers):
    r = await client.post("/config/effect-types", json={"type_name": "AlreadyDeleted"}, headers=admin_headers)
    type_id = r.json()["type_id"]
    await conn.execute("UPDATE effect_types SET deleted_at = NOW() WHERE type_id=$1", type_id)
    r = await client.delete(f"/config/effect-types/{type_id}", headers=admin_headers)
    assert r.status_code == 200
    assert "already deleted" in r.json()["detail"]
    count = await conn.fetchval(
        "SELECT COUNT(*) FROM audit_log WHERE table_name='effect_types' AND record_id=$1 AND operation='DELETE'",
        type_id,
    )
    assert count == 0


async def test_delete_config_blocked_by_ref_check(client, conn, admin_headers):
    r = await client.post("/config/effect-types", json={"type_name": "InUseType"}, headers=admin_headers)
    type_id = r.json()["type_id"]
    await client.post("/effects", json={"effect_name": "RefEffect", "effect_type_ids": [str(type_id)]}, headers=admin_headers)
    r = await client.delete(f"/config/effect-types/{type_id}", headers=admin_headers)
    assert r.status_code == 409
