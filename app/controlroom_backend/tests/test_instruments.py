import pytest
from typing import NamedTuple
from uuid import uuid4


class _ParentsCase(NamedTuple):
    op: str
    suffix: str
    expected_in: str
    expected_out: str


# ---------------------------------------------------------------------------
# LIST
# ---------------------------------------------------------------------------

async def test_list_instruments_returns_results(client, conn):
    await conn.execute("INSERT INTO instruments (instrument_name) VALUES ('Seed Synth')")
    response = await client.get("/instruments")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data and "total" in data
    assert len(data["items"]) > 0


async def test_list_instruments_fields(client, conn):
    await conn.execute("INSERT INTO instruments (instrument_name) VALUES ('Fields Synth')")
    item = (await client.get("/instruments")).json()["items"][0]
    for field in ("instrument_id", "instrument_name", "full_instrument_name",
                  "instrument_types", "tags", "parents", "created_at"):
        assert field in item


async def test_list_instruments_search_no_match(client):
    response = await client.get("/instruments?filter_name=zzznomatchzzz")
    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["total"] == 0


async def test_filter_instruments_by_brand_prefix_in_name(client, conn):
    """filter_name should match the full display name (brand + instrument_name)."""
    brand_row = await conn.fetchrow(
        "INSERT INTO brands (brand_name, legal_name) VALUES ('NameBrand_Inst', 'NameBrand_Inst') RETURNING brand_id"
    )
    await conn.execute(
        "INSERT INTO instruments (instrument_name, brand_id) VALUES ('KeyboardX', $1)",
        brand_row["brand_id"],
    )
    response = await client.get("/instruments?filter_name=NameBrand_Inst")
    assert response.status_code == 200
    names = [i["full_instrument_name"] for i in response.json()["items"]]
    assert any("NameBrand_Inst" in n for n in names)


async def test_filter_instruments_by_model_brand_name(client, conn):
    """filter_models should match on the model's brand name, not just model_name."""
    brand_row = await conn.fetchrow(
        "INSERT INTO brands (brand_name, legal_name) VALUES ('BrandFilter_Inst', 'BrandFilter_Inst') RETURNING brand_id"
    )
    model_row = await conn.fetchrow(
        "INSERT INTO models (model_name, brand_id) VALUES ('M001', $1) RETURNING model_id",
        brand_row["brand_id"],
    )
    await conn.execute(
        "INSERT INTO instruments (instrument_name, model_ids) VALUES ('FilterInst', $1)",
        [model_row["model_id"]],
    )
    response = await client.get("/instruments?filter_models=BrandFilter_Inst")
    assert response.status_code == 200
    names = [i["instrument_name"] for i in response.json()["items"]]
    assert "FilterInst" in names


async def test_list_instruments_pagination(client, conn):
    await conn.execute("INSERT INTO instruments (instrument_name) VALUES ('Paged Synth')")
    response = await client.get("/instruments?limit=1&offset=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 1
    assert data["total"] >= 1


# ---------------------------------------------------------------------------
# GET ONE
# ---------------------------------------------------------------------------

async def test_get_instrument(client, conn):
    row = await conn.fetchrow(
        "INSERT INTO instruments (instrument_name) VALUES ('Get Me') RETURNING instrument_id"
    )
    response = await client.get(f"/instruments/{row['instrument_id']}")
    assert response.status_code == 200
    assert response.json()["instrument_id"] == str(row["instrument_id"])


async def test_get_instrument_not_found(client):
    response = await client.get(f"/instruments/{uuid4()}")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# CREATE
# ---------------------------------------------------------------------------

async def test_create_instrument(client, admin_headers):
    response = await client.post("/instruments", json={"instrument_name": "Test Synth"}, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["instrument_name"] == "Test Synth"
    assert data["instrument_types"] == []
    assert data["parents"] == []


async def test_create_instrument_missing_name(client, admin_headers):
    response = await client.post("/instruments", json={"version": "1.0"}, headers=admin_headers)
    assert response.status_code == 422


async def test_create_instrument_with_types(client, conn, admin_headers):
    row = await conn.fetchrow("SELECT type_id FROM instrument_types LIMIT 1")
    type_id = str(row["type_id"])
    response = await client.post("/instruments", json={
        "instrument_name": "Typed Synth",
        "instrument_type_ids": [type_id],
    }, headers=admin_headers)
    assert response.status_code == 201
    assert len(response.json()["instrument_types"]) == 1


async def test_create_instrument_with_parent(client, conn, admin_headers):
    parent = await conn.fetchrow(
        "INSERT INTO instruments (instrument_name) VALUES ('Parent Synth') RETURNING instrument_id"
    )
    response = await client.post("/instruments", json={
        "instrument_name": "Child Synth",
        "parent_ids": [{"table_name": "instruments", "id": str(parent["instrument_id"])}],
    }, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert len(data["parents"]) == 1
    assert data["parents"][0]["table_name"] == "instruments"
    assert data["parents"][0]["name"] == "Parent Synth"


async def test_create_instrument_with_workstation_parent(client, conn, admin_headers):
    ws = await conn.fetchrow(
        "INSERT INTO workstations (tool_name) VALUES ('Test DAW') RETURNING workstation_id"
    )
    response = await client.post("/instruments", json={
        "instrument_name": "DAW Instrument",
        "parent_ids": [{"table_name": "workstations", "id": str(ws["workstation_id"])}],
    }, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert len(data["parents"]) == 1
    assert data["parents"][0]["table_name"] == "workstations"
    assert data["parents"][0]["name"] == "Test DAW"


# ---------------------------------------------------------------------------
# UPDATE
# ---------------------------------------------------------------------------

async def test_update_instrument(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO instruments (instrument_name) VALUES ('Update Me') RETURNING instrument_id"
    )
    response = await client.patch(f"/instruments/{row['instrument_id']}", json={"version": "2.0"}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["version"] == "2.0"
    assert response.json()["instrument_name"] == "Update Me"


async def test_update_instrument_parent_ids(client, conn, admin_headers):
    parent = await conn.fetchrow(
        "INSERT INTO instruments (instrument_name) VALUES ('Parent Synth Update') RETURNING instrument_id"
    )
    child = await conn.fetchrow(
        "INSERT INTO instruments (instrument_name) VALUES ('Child Synth Update') RETURNING instrument_id"
    )
    response = await client.patch(
        f"/instruments/{child['instrument_id']}",
        json={"parent_ids": [{"table_name": "instruments", "id": str(parent["instrument_id"])}]},
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["parents"]) == 1
    assert data["parents"][0]["table_name"] == "instruments"
    assert data["parents"][0]["id"] == str(parent["instrument_id"])
    assert data["parents"][0]["name"] == "Parent Synth Update"


async def test_update_instrument_not_found(client, admin_headers):
    response = await client.patch(f"/instruments/{uuid4()}", json={"version": "2.0"}, headers=admin_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------

async def test_delete_instrument(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO instruments (instrument_name) VALUES ('Delete Me') RETURNING instrument_id"
    )
    response = await client.delete(f"/instruments/{row['instrument_id']}", headers=admin_headers)
    assert response.status_code == 204


async def test_delete_instrument_not_found(client, admin_headers):
    response = await client.delete(f"/instruments/{uuid4()}", headers=admin_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# FILTER — parents is_empty / is_not_empty
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("case", [
    _ParentsCase("is_empty",     "",  "OrphanInst",  "ChildInst"),
    _ParentsCase("is_not_empty", "2", "ChildInst2",  "OrphanInst2"),
])
async def test_filter_instruments_parents(client, conn, admin_headers, case):
    parent = await conn.fetchrow(
        f"INSERT INTO instruments (instrument_name) VALUES ('ParentInst{case.suffix}') RETURNING instrument_id"
    )
    await conn.execute(f"INSERT INTO instruments (instrument_name) VALUES ('OrphanInst{case.suffix}')")
    resp = await client.post("/instruments", json={
        "instrument_name": f"ChildInst{case.suffix}",
        "parent_ids": [{"table_name": "instruments", "id": str(parent["instrument_id"])}],
    }, headers=admin_headers)
    assert resp.status_code == 201
    response = await client.get(f"/instruments?filter_parents_op={case.op}&limit=9999")
    assert response.status_code == 200
    names = [i["instrument_name"] for i in response.json()["items"]]
    assert case.expected_in in names
    assert case.expected_out not in names
