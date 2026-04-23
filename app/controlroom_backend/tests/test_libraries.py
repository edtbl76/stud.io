import pytest
from typing import NamedTuple
from uuid import uuid4


class _ParentsCase(NamedTuple):
    op: str
    suffix: str
    expected_in: str
    expected_out: str


class _ParentSourceCase(NamedTuple):
    insert_sql: str
    id_key: str
    parent_table: str
    child_name: str
    expected_name: str


# ---------------------------------------------------------------------------
# LIST
# ---------------------------------------------------------------------------

async def test_list_libraries_returns_results(client, conn):
    await conn.execute("INSERT INTO libraries (library_name) VALUES ('Seed Library')")
    response = await client.get("/studio/session/libraries")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data and "total" in data
    assert len(data["items"]) > 0


async def test_list_libraries_fields(client, conn):
    await conn.execute("INSERT INTO libraries (library_name) VALUES ('Fields Library')")
    item = (await client.get("/studio/session/libraries")).json()["items"][0]
    for field in ("library_id", "library_name", "full_library_name",
                  "models", "tags", "parents", "created_at"):
        assert field in item


async def test_list_libraries_search_no_match(client):
    response = await client.get("/studio/session/libraries?filter_name=zzznomatchzzz")
    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["total"] == 0


async def test_filter_libraries_by_model_brand_name(client, conn):
    """filter_models should match on the model's brand name, not just model_name."""
    brand_row = await conn.fetchrow(
        "INSERT INTO brands (brand_name, legal_name) VALUES ('BrandFilter_Lib', 'BrandFilter_Lib') RETURNING brand_id"
    )
    model_row = await conn.fetchrow(
        "INSERT INTO models (model_name, brand_id) VALUES ('L001', $1) RETURNING model_id",
        brand_row["brand_id"],
    )
    await conn.execute(
        "INSERT INTO libraries (library_name, model_ids) VALUES ('FilterLib', $1)",
        [model_row["model_id"]],
    )
    response = await client.get("/studio/session/libraries?filter_models=BrandFilter_Lib")
    assert response.status_code == 200
    names = [i["library_name"] for i in response.json()["items"]]
    assert "FilterLib" in names


async def test_list_libraries_pagination(client, conn):
    await conn.execute("INSERT INTO libraries (library_name) VALUES ('Paged Library')")
    response = await client.get("/studio/session/libraries?limit=1&offset=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 1
    assert data["total"] >= 1


# ---------------------------------------------------------------------------
# GET ONE
# ---------------------------------------------------------------------------

async def test_get_library(client, conn):
    row = await conn.fetchrow(
        "INSERT INTO libraries (library_name) VALUES ('Get Me') RETURNING library_id"
    )
    response = await client.get(f"/studio/session/libraries/{row['library_id']}")
    assert response.status_code == 200
    assert response.json()["library_id"] == str(row["library_id"])


async def test_get_library_not_found(client):
    response = await client.get(f"/studio/session/libraries/{uuid4()}")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# CREATE
# ---------------------------------------------------------------------------

async def test_create_library(client, admin_headers):
    response = await client.post("/studio/session/libraries", json={"library_name": "Test Library"}, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["library_name"] == "Test Library"
    assert data["models"] == []
    assert data["parents"] == []


async def test_create_library_missing_name(client, admin_headers):
    response = await client.post("/studio/session/libraries", json={"description": "No name"}, headers=admin_headers)
    assert response.status_code == 422


@pytest.mark.parametrize("case", [
    _ParentSourceCase(
        "INSERT INTO instruments (instrument_name) VALUES ('Parent Synth') RETURNING instrument_id",
        "instrument_id", "instruments", "Child Library", "Parent Synth",
    ),
    _ParentSourceCase(
        "INSERT INTO workstations (tool_name) VALUES ('Test DAW Lib') RETURNING workstation_id",
        "workstation_id", "workstations", "DAW Library", "Test DAW Lib",
    ),
])
async def test_create_library_parent_name_resolves(client, conn, admin_headers, case):
    parent = await conn.fetchrow(case.insert_sql)
    response = await client.post("/studio/session/libraries", json={
        "library_name": case.child_name,
        "parent_ids": [{"table_name": case.parent_table, "id": str(parent[case.id_key])}],
    }, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert len(data["parents"]) == 1
    assert data["parents"][0]["table_name"] == case.parent_table
    assert data["parents"][0]["name"] == case.expected_name


# ---------------------------------------------------------------------------
# UPDATE
# ---------------------------------------------------------------------------

async def test_update_library(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO libraries (library_name) VALUES ('Update Me') RETURNING library_id"
    )
    response = await client.patch(f"/studio/session/libraries/{row['library_id']}", json={"description": "Updated"}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["description"] == "Updated"
    assert response.json()["library_name"] == "Update Me"


async def test_update_library_parent_ids(client, conn, admin_headers):
    parent = await conn.fetchrow(
        "INSERT INTO instruments (instrument_name) VALUES ('Parent Sampler Update') RETURNING instrument_id"
    )
    child = await conn.fetchrow(
        "INSERT INTO libraries (library_name) VALUES ('Child Library Update') RETURNING library_id"
    )
    response = await client.patch(
        f"/studio/session/libraries/{child['library_id']}",
        json={"parent_ids": [{"table_name": "instruments", "id": str(parent["instrument_id"])}]},
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["parents"]) == 1
    assert data["parents"][0]["table_name"] == "instruments"
    assert data["parents"][0]["id"] == str(parent["instrument_id"])
    assert data["parents"][0]["name"] == "Parent Sampler Update"


async def test_update_library_not_found(client, admin_headers):
    response = await client.patch(f"/studio/session/libraries/{uuid4()}", json={"description": "Ghost"}, headers=admin_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------

async def test_delete_library(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO libraries (library_name) VALUES ('Delete Me') RETURNING library_id"
    )
    response = await client.delete(f"/studio/session/libraries/{row['library_id']}", headers=admin_headers)
    assert response.status_code == 204


async def test_delete_library_not_found(client, admin_headers):
    response = await client.delete(f"/studio/session/libraries/{uuid4()}", headers=admin_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# FILTER — parents is_empty / is_not_empty
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("case", [
    _ParentsCase("is_empty",     "",  "OrphanLib",  "ChildLib"),
    _ParentsCase("is_not_empty", "2", "ChildLib2",  "OrphanLib2"),
])
async def test_filter_libraries_parents(client, conn, admin_headers, case):
    parent = await conn.fetchrow(
        f"INSERT INTO instruments (instrument_name) VALUES ('ParentInstLib{case.suffix}') RETURNING instrument_id"
    )
    await conn.execute(f"INSERT INTO libraries (library_name) VALUES ('OrphanLib{case.suffix}')")
    resp = await client.post("/studio/session/libraries", json={
        "library_name": f"ChildLib{case.suffix}",
        "parent_ids": [{"table_name": "instruments", "id": str(parent["instrument_id"])}],
    }, headers=admin_headers)
    assert resp.status_code == 201
    response = await client.get(f"/studio/session/libraries?filter_parents_op={case.op}&limit=9999")
    assert response.status_code == 200
    names = [i["library_name"] for i in response.json()["items"]]
    assert case.expected_in in names
    assert case.expected_out not in names
