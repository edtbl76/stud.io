from collections import namedtuple
from uuid import uuid4
import pytest


# ---------------------------------------------------------------------------
# LIST
# ---------------------------------------------------------------------------

async def test_list_brands_returns_results(client):
    response = await client.get("/studio/catalog/brands")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data and "total" in data
    assert len(data["items"]) > 0


async def test_list_brands_fields(client):
    response = await client.get("/studio/catalog/brands")
    brand = response.json()["items"][0]
    for field in ("brand_id", "legal_name", "brand_name", "entity_type_name",
                  "website", "description", "created_at"):
        assert field in brand


async def test_list_brands_search(client):
    response = await client.get("/studio/catalog/brands?filter_name=ssl")
    assert response.status_code == 200
    results = response.json()["items"]
    assert len(results) > 0
    for b in results:
        combined = ((b.get("brand_name") or "") + " " + (b.get("legal_name") or "")).lower()
        assert "ssl" in combined


async def test_list_brands_search_no_match(client):
    response = await client.get("/studio/catalog/brands?filter_name=zzznomatchzzz")
    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["total"] == 0


# ---------------------------------------------------------------------------
# GET ONE
# ---------------------------------------------------------------------------

async def test_get_brand(client, conn):
    row = await conn.fetchrow("SELECT brand_id FROM brands LIMIT 1")
    brand_id = str(row["brand_id"])
    response = await client.get(f"/studio/catalog/brands/{brand_id}")
    assert response.status_code == 200
    assert response.json()["brand_id"] == brand_id


async def test_get_brand_resolves_entity_type(client, conn):
    row = await conn.fetchrow(
        "SELECT brand_id FROM brands WHERE entity_type_id IS NOT NULL LIMIT 1"
    )
    brand_id = str(row["brand_id"])
    response = await client.get(f"/studio/catalog/brands/{brand_id}")
    assert response.status_code == 200
    assert response.json()["entity_type_name"] is not None


async def test_get_brand_not_found(client):
    response = await client.get(f"/studio/catalog/brands/{uuid4()}")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# CREATE
# ---------------------------------------------------------------------------

async def test_create_brand(client, admin_headers):
    payload = {"legal_name": "Test Brand Inc.", "brand_name": "TestBrand", "website": "https://test.com"}
    response = await client.post("/studio/catalog/brands", json=payload, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["legal_name"] == "Test Brand Inc."
    assert data["brand_name"] == "TestBrand"
    assert data["website"] == "https://test.com"
    assert "brand_id" in data


async def test_create_brand_minimal(client, admin_headers):
    response = await client.post("/studio/catalog/brands", json={"brand_name": "Minimal Brand"}, headers=admin_headers)
    assert response.status_code == 201
    assert response.json()["brand_name"] == "Minimal Brand"


async def test_create_brand_without_brand_name_rejected(client, admin_headers):
    response = await client.post("/studio/catalog/brands", json={"legal_name": "No Brand Name"}, headers=admin_headers)
    assert response.status_code == 422


async def test_create_brand_brand_name_only(client, admin_headers):
    response = await client.post("/studio/catalog/brands", json={"brand_name": "BrandNameOnly"}, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["brand_name"] == "BrandNameOnly"
    assert data["legal_name"] is None


# ---------------------------------------------------------------------------
# UPDATE
# ---------------------------------------------------------------------------

async def test_update_brand(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO brands (legal_name, brand_name) VALUES ('Update Me Inc.', 'UpdateMe') RETURNING brand_id"
    )
    brand_id = str(row["brand_id"])
    response = await client.patch(f"/studio/catalog/brands/{brand_id}", json={"website": "https://updated.com"}, headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["website"] == "https://updated.com"
    assert data["brand_name"] == "UpdateMe"  # unchanged


async def test_update_brand_not_found(client, admin_headers):
    response = await client.patch(f"/studio/catalog/brands/{uuid4()}", json={"website": "https://x.com"}, headers=admin_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------

async def test_delete_brand(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO brands (legal_name, brand_name) VALUES ('Delete Me Inc.', 'Delete Me') RETURNING brand_id"
    )
    brand_id = str(row["brand_id"])
    response = await client.delete(f"/studio/catalog/brands/{brand_id}", headers=admin_headers)
    assert response.status_code == 204


async def test_delete_brand_not_found(client, admin_headers):
    response = await client.delete(f"/studio/catalog/brands/{uuid4()}", headers=admin_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# MULTI-SORT
# ---------------------------------------------------------------------------

async def test_list_brands_multi_sort_two_columns(client):
    response = await client.get("/studio/catalog/brands?sort_by=brand_name&sort_by=created_at&sort_dir=asc&sort_dir=desc")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data and "total" in data


async def test_list_brands_multi_sort_invalid_column_falls_back(client):
    # An invalid secondary column is silently ignored; the primary still sorts.
    response = await client.get("/studio/catalog/brands?sort_by=brand_name&sort_by=__invalid__&sort_dir=asc&sort_dir=asc")
    assert response.status_code == 200
    assert response.json()["items"]


async def test_list_brands_multi_sort_all_invalid_uses_default(client):
    response = await client.get("/studio/catalog/brands?sort_by=__bad__&sort_dir=asc")
    assert response.status_code == 200
    assert response.json()["items"]


# ---------------------------------------------------------------------------
# DELETE (existing)
# ---------------------------------------------------------------------------

async def test_delete_brand_blocked_when_referenced(client, conn, admin_headers):
    row = await conn.fetchrow(
        "SELECT brand_id FROM models WHERE brand_id IS NOT NULL LIMIT 1"
    )
    brand_id = str(row["brand_id"])
    response = await client.delete(f"/studio/catalog/brands/{brand_id}", headers=admin_headers)
    assert response.status_code == 409


_BrandRefCase = namedtuple("_BrandRefCase", ["table", "name_col", "name_val"])

@pytest.mark.parametrize("case", [
    _BrandRefCase("instruments", "instrument_name", "__ref_inst__"),
    _BrandRefCase("effects",     "effect_name",     "__ref_fx__"),
    _BrandRefCase("libraries",   "library_name",    "__ref_lib__"),
], ids=["instruments", "effects", "libraries"])
async def test_delete_brand_blocked_when_referenced_by_entity(client, conn, admin_headers, case):
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('__del_brand_ref__') RETURNING brand_id"
    )
    await conn.execute(
        f"INSERT INTO {case.table} ({case.name_col}, brand_id) VALUES ($1, $2)",  # safe: case fields from test constants
        case.name_val, brand_id,
    )
    response = await client.delete(f"/studio/catalog/brands/{brand_id}", headers=admin_headers)
    assert response.status_code == 409
    assert case.table in response.json()["detail"]
