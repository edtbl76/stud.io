from uuid import uuid4


# ---------------------------------------------------------------------------
# LIST
# ---------------------------------------------------------------------------

async def test_list_models_returns_results(client):
    response = await client.get("/models")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data and "total" in data
    assert len(data["items"]) > 0


async def test_list_models_fields(client):
    model = (await client.get("/models")).json()["items"][0]
    for field in ("model_id", "model_name", "full_model_name", "model_types", "created_at"):
        assert field in model


async def test_list_models_search(client):
    response = await client.get("/models?filter_name=a")
    assert response.status_code == 200
    assert "items" in response.json()


async def test_list_models_search_no_match(client):
    response = await client.get("/models?filter_name=zzznomatchzzz")
    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["total"] == 0


async def test_filter_models_by_brand_prefix_in_name(client, conn):
    """filter_name should match the full display name (brand + model_name), not just model_name."""
    brand_row = await conn.fetchrow(
        "INSERT INTO brands (brand_name, legal_name) VALUES ('NameBrand_Mod', 'NameBrand_Mod') RETURNING brand_id"
    )
    await conn.execute(
        "INSERT INTO models (model_name, brand_id) VALUES ('X100', $1)",
        brand_row["brand_id"],
    )
    response = await client.get("/models?filter_name=NameBrand_Mod")
    assert response.status_code == 200
    names = [i["full_model_name"] for i in response.json()["items"]]
    assert any("NameBrand_Mod" in n for n in names)


async def test_list_models_pagination(client):
    response = await client.get("/models?limit=2&offset=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) <= 2
    assert data["total"] >= len(data["items"])


# ---------------------------------------------------------------------------
# GET ONE
# ---------------------------------------------------------------------------

async def test_get_model(client, conn):
    row = await conn.fetchrow("SELECT model_id FROM models LIMIT 1")
    response = await client.get(f"/models/{row['model_id']}")
    assert response.status_code == 200
    assert response.json()["model_id"] == str(row["model_id"])


async def test_get_model_resolves_brand(client, conn):
    row = await conn.fetchrow("SELECT model_id FROM models WHERE brand_id IS NOT NULL LIMIT 1")
    response = await client.get(f"/models/{row['model_id']}")
    assert response.status_code == 200
    assert response.json()["brand_name"] is not None


async def test_get_model_not_found(client):
    response = await client.get(f"/models/{uuid4()}")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# CREATE
# ---------------------------------------------------------------------------

async def test_create_model(client, admin_headers):
    payload = {"model_name": "Test Model", "creator": "Test Creator"}
    response = await client.post("/models", json=payload, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["model_name"] == "Test Model"
    assert data["creator"] == "Test Creator"
    assert "model_id" in data


async def test_create_model_minimal(client, admin_headers):
    response = await client.post("/models", json={"model_name": "Minimal Model"}, headers=admin_headers)
    assert response.status_code == 201
    assert response.json()["model_name"] == "Minimal Model"


async def test_create_model_missing_name(client, admin_headers):
    response = await client.post("/models", json={"creator": "No Name"}, headers=admin_headers)
    assert response.status_code == 422


async def test_create_model_resolved_types(client, conn, admin_headers):
    row = await conn.fetchrow("SELECT type_id FROM model_types LIMIT 1")
    type_id = str(row["type_id"])
    response = await client.post("/models", json={"model_name": "Typed Model", "model_type_ids": [type_id]}, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert len(data["model_types"]) == 1
    assert data["model_types"][0]["id"] == type_id


# ---------------------------------------------------------------------------
# UPDATE
# ---------------------------------------------------------------------------

async def test_update_model(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO models (model_name) VALUES ('Update Me') RETURNING model_id"
    )
    response = await client.patch(f"/models/{row['model_id']}", json={"years_active": "2020-2024"}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["years_active"] == "2020-2024"
    assert response.json()["model_name"] == "Update Me"


async def test_update_model_not_found(client, admin_headers):
    response = await client.patch(f"/models/{uuid4()}", json={"creator": "Ghost"}, headers=admin_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------

async def test_delete_model(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO models (model_name) VALUES ('Delete Me') RETURNING model_id"
    )
    response = await client.delete(f"/models/{row['model_id']}", headers=admin_headers)
    assert response.status_code == 204


async def test_delete_model_not_found(client, admin_headers):
    response = await client.delete(f"/models/{uuid4()}", headers=admin_headers)
    assert response.status_code == 404


async def test_delete_model_blocked_when_referenced(client, conn, admin_headers):
    # Find a model that is in an effect's model_ids array
    row = await conn.fetchrow(
        "SELECT model_id FROM models m "
        "WHERE EXISTS (SELECT 1 FROM effects e WHERE m.model_id = ANY(e.model_ids)) LIMIT 1"
    )
    if row is None:
        return  # no such fixture data — skip
    response = await client.delete(f"/models/{row['model_id']}", headers=admin_headers)
    assert response.status_code == 409
