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

async def test_list_effects_returns_results(client):
    response = await client.get("/effects")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data and "total" in data
    assert len(data["items"]) > 0


async def test_list_effects_fields(client):
    effect = (await client.get("/effects")).json()["items"][0]
    for field in ("effect_id", "effect_name", "full_effect_name",
                  "effect_types", "tags", "parents", "created_at"):
        assert field in effect


async def test_list_effects_search(client):
    response = await client.get("/effects?filter_name=a")
    assert response.status_code == 200
    assert "items" in response.json()


async def test_list_effects_search_no_match(client):
    response = await client.get("/effects?filter_name=zzznomatchzzz")
    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["total"] == 0


async def test_filter_effects_by_brand_prefix_in_name(client, conn):
    """filter_name should match the full display name (brand + effect_name)."""
    brand_row = await conn.fetchrow(
        "INSERT INTO brands (brand_name, legal_name) VALUES ('NameBrand_Eff', 'NameBrand_Eff') RETURNING brand_id"
    )
    await conn.execute(
        "INSERT INTO effects (effect_name, brand_id) VALUES ('Compressor99', $1)",
        brand_row["brand_id"],
    )
    response = await client.get("/effects?filter_name=NameBrand_Eff")
    assert response.status_code == 200
    names = [i["full_effect_name"] for i in response.json()["items"]]
    assert any("NameBrand_Eff" in n for n in names)


async def test_filter_effects_by_model_brand_name(client, conn):
    """filter_models should match on the model's brand name, not just model_name."""
    brand_row = await conn.fetchrow(
        "INSERT INTO brands (brand_name, legal_name) VALUES ('BrandFilter_Eff', 'BrandFilter_Eff') RETURNING brand_id"
    )
    model_row = await conn.fetchrow(
        "INSERT INTO models (model_name, brand_id) VALUES ('E001', $1) RETURNING model_id",
        brand_row["brand_id"],
    )
    await conn.execute(
        "INSERT INTO effects (effect_name, model_ids) VALUES ('FilterEffect', $1)",
        [model_row["model_id"]],
    )
    response = await client.get("/effects?filter_models=BrandFilter_Eff")
    assert response.status_code == 200
    names = [i["effect_name"] for i in response.json()["items"]]
    assert "FilterEffect" in names


async def test_list_effects_pagination(client):
    response = await client.get("/effects?limit=2&offset=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) <= 2
    assert data["total"] >= len(data["items"])


async def test_list_effects_sort(client):
    total = (await client.get("/effects")).json()["total"]
    asc = (await client.get(f"/effects?limit={total}&sort_by=effect_name&sort_dir=asc")).json()["items"]
    desc = (await client.get(f"/effects?limit={total}&sort_by=effect_name&sort_dir=desc")).json()["items"]
    asc_names = [e["effect_name"] for e in asc]
    desc_names = [e["effect_name"] for e in desc]
    assert asc_names == list(reversed(desc_names))


# ---------------------------------------------------------------------------
# GET ONE
# ---------------------------------------------------------------------------

async def test_get_effect(client, conn):
    row = await conn.fetchrow("SELECT effect_id FROM effects LIMIT 1")
    response = await client.get(f"/effects/{row['effect_id']}")
    assert response.status_code == 200
    assert response.json()["effect_id"] == str(row["effect_id"])


async def test_get_effect_resolves_brand(client, conn):
    row = await conn.fetchrow("SELECT effect_id FROM effects WHERE brand_id IS NOT NULL LIMIT 1")
    response = await client.get(f"/effects/{row['effect_id']}")
    assert response.status_code == 200
    assert response.json()["brand_name"] is not None


async def test_get_effect_not_found(client):
    response = await client.get(f"/effects/{uuid4()}")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# CREATE
# ---------------------------------------------------------------------------

async def test_create_effect(client, admin_headers):
    response = await client.post("/effects", json={"effect_name": "Test EQ"}, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["effect_name"] == "Test EQ"
    assert data["effect_types"] == []
    assert data["tags"] == []
    assert data["parents"] == []


async def test_create_effect_missing_name(client, admin_headers):
    response = await client.post("/effects", json={"version": "1.0"}, headers=admin_headers)
    assert response.status_code == 422


async def test_create_effect_with_types(client, conn, admin_headers):
    row = await conn.fetchrow("SELECT type_id FROM effect_types LIMIT 1")
    type_id = str(row["type_id"])
    response = await client.post("/effects", json={
        "effect_name": "Typed Effect",
        "effect_type_ids": [type_id],
    }, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert len(data["effect_types"]) == 1
    assert data["effect_types"][0]["id"] == type_id


async def test_create_effect_with_parent(client, conn, admin_headers):
    parent = await conn.fetchrow("SELECT effect_id FROM effects LIMIT 1")
    response = await client.post("/effects", json={
        "effect_name": "Child Effect",
        "parent_ids": [{"table_name": "effects", "id": str(parent["effect_id"])}],
    }, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert len(data["parents"]) == 1
    assert data["parents"][0]["table_name"] == "effects"


# ---------------------------------------------------------------------------
# UPDATE
# ---------------------------------------------------------------------------

async def test_update_effect(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO effects (effect_name) VALUES ('Update Me') RETURNING effect_id"
    )
    response = await client.patch(f"/effects/{row['effect_id']}", json={"collection": "Test Suite"}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["collection"] == "Test Suite"
    assert response.json()["effect_name"] == "Update Me"


async def test_update_effect_parent_ids(client, conn, admin_headers):
    parent = await conn.fetchrow(
        "INSERT INTO effects (effect_name) VALUES ('Parent FX') RETURNING effect_id"
    )
    child = await conn.fetchrow(
        "INSERT INTO effects (effect_name) VALUES ('Child FX') RETURNING effect_id"
    )
    response = await client.patch(
        f"/effects/{child['effect_id']}",
        json={"parent_ids": [{"table_name": "effects", "id": str(parent["effect_id"])}]},
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["parents"]) == 1
    assert data["parents"][0]["table_name"] == "effects"
    assert data["parents"][0]["id"] == str(parent["effect_id"])


async def test_update_effect_not_found(client, admin_headers):
    response = await client.patch(f"/effects/{uuid4()}", json={"version": "2.0"}, headers=admin_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------

async def test_delete_effect(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO effects (effect_name) VALUES ('Delete Me') RETURNING effect_id"
    )
    response = await client.delete(f"/effects/{row['effect_id']}", headers=admin_headers)
    assert response.status_code == 204


async def test_delete_effect_not_found(client, admin_headers):
    response = await client.delete(f"/effects/{uuid4()}", headers=admin_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# FILTER — parents is_empty / is_not_empty
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("case", [
    _ParentsCase("is_empty",     "",  "OrphanFX",  "ChildFX"),
    _ParentsCase("is_not_empty", "2", "ChildFX2",  "OrphanFX2"),
])
async def test_filter_effects_parents(client, conn, admin_headers, case):
    parent = await conn.fetchrow(
        f"INSERT INTO effects (effect_name) VALUES ('ParentFX{case.suffix}') RETURNING effect_id"
    )
    await conn.execute(f"INSERT INTO effects (effect_name) VALUES ('OrphanFX{case.suffix}')")
    resp = await client.post("/effects", json={
        "effect_name": f"ChildFX{case.suffix}",
        "parent_ids": [{"table_name": "effects", "id": str(parent["effect_id"])}],
    }, headers=admin_headers)
    assert resp.status_code == 201
    response = await client.get(f"/effects?filter_parents_op={case.op}&limit=9999")
    assert response.status_code == 200
    names = [i["effect_name"] for i in response.json()["items"]]
    assert case.expected_in in names
    assert case.expected_out not in names
