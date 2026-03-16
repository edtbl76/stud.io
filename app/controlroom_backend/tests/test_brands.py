from uuid import uuid4


# ---------------------------------------------------------------------------
# LIST
# ---------------------------------------------------------------------------

async def test_list_brands_returns_results(client):
    response = await client.get("/brands")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


async def test_list_brands_fields(client):
    response = await client.get("/brands")
    brand = response.json()[0]
    for field in ("brand_id", "legal_name", "brand_name", "entity_type_name",
                  "website", "description", "created_at"):
        assert field in brand


async def test_list_brands_search(client):
    response = await client.get("/brands?q=ssl")
    assert response.status_code == 200
    results = response.json()
    assert len(results) > 0
    for b in results:
        combined = ((b.get("brand_name") or "") + " " + (b.get("legal_name") or "")).lower()
        assert "ssl" in combined


async def test_list_brands_search_no_match(client):
    response = await client.get("/brands?q=zzznomatchzzz")
    assert response.status_code == 200
    assert response.json() == []


# ---------------------------------------------------------------------------
# GET ONE
# ---------------------------------------------------------------------------

async def test_get_brand(client, conn):
    row = await conn.fetchrow("SELECT brand_id FROM brands LIMIT 1")
    brand_id = str(row["brand_id"])
    response = await client.get(f"/brands/{brand_id}")
    assert response.status_code == 200
    assert response.json()["brand_id"] == brand_id


async def test_get_brand_resolves_entity_type(client, conn):
    row = await conn.fetchrow(
        "SELECT brand_id FROM brands WHERE entity_type_id IS NOT NULL LIMIT 1"
    )
    brand_id = str(row["brand_id"])
    response = await client.get(f"/brands/{brand_id}")
    assert response.status_code == 200
    assert response.json()["entity_type_name"] is not None


async def test_get_brand_not_found(client):
    response = await client.get(f"/brands/{uuid4()}")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# CREATE
# ---------------------------------------------------------------------------

async def test_create_brand(client):
    payload = {"legal_name": "Test Brand Inc.", "brand_name": "TestBrand", "website": "https://test.com"}
    response = await client.post("/brands", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["legal_name"] == "Test Brand Inc."
    assert data["brand_name"] == "TestBrand"
    assert data["website"] == "https://test.com"
    assert "brand_id" in data


async def test_create_brand_minimal(client):
    response = await client.post("/brands", json={"legal_name": "Minimal Brand"})
    assert response.status_code == 201
    assert response.json()["legal_name"] == "Minimal Brand"


async def test_create_brand_missing_legal_name(client):
    response = await client.post("/brands", json={"brand_name": "No Legal Name"})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# UPDATE
# ---------------------------------------------------------------------------

async def test_update_brand(client, conn):
    row = await conn.fetchrow(
        "INSERT INTO brands (legal_name, brand_name) VALUES ('Update Me Inc.', 'UpdateMe') RETURNING brand_id"
    )
    brand_id = str(row["brand_id"])
    response = await client.patch(f"/brands/{brand_id}", json={"website": "https://updated.com"})
    assert response.status_code == 200
    data = response.json()
    assert data["website"] == "https://updated.com"
    assert data["brand_name"] == "UpdateMe"  # unchanged


async def test_update_brand_not_found(client):
    response = await client.patch(f"/brands/{uuid4()}", json={"website": "https://x.com"})
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------

async def test_delete_brand(client, conn):
    row = await conn.fetchrow(
        "INSERT INTO brands (legal_name) VALUES ('Delete Me Inc.') RETURNING brand_id"
    )
    brand_id = str(row["brand_id"])
    response = await client.delete(f"/brands/{brand_id}")
    assert response.status_code == 204


async def test_delete_brand_not_found(client):
    response = await client.delete(f"/brands/{uuid4()}")
    assert response.status_code == 404


async def test_delete_brand_blocked_when_referenced(client, conn):
    row = await conn.fetchrow(
        "SELECT brand_id FROM models WHERE brand_id IS NOT NULL LIMIT 1"
    )
    brand_id = str(row["brand_id"])
    response = await client.delete(f"/brands/{brand_id}")
    assert response.status_code == 409
