from uuid import uuid4


# ---------------------------------------------------------------------------
# LIST
# ---------------------------------------------------------------------------

async def test_list_models_returns_results(client):
    response = await client.get("/models")
    assert response.status_code == 200
    assert len(response.json()) > 0


async def test_list_models_fields(client):
    model = response = await client.get("/models")
    model = response.json()[0]
    for field in ("model_id", "model_name", "full_model_name", "model_types", "created_at"):
        assert field in model


async def test_list_models_search(client):
    response = await client.get("/models?q=a")
    assert response.status_code == 200


async def test_list_models_search_no_match(client):
    response = await client.get("/models?q=zzznomatchzzz")
    assert response.status_code == 200
    assert response.json() == []


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

async def test_create_model(client):
    payload = {"model_name": "Test Model", "creator": "Test Creator"}
    response = await client.post("/models", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["model_name"] == "Test Model"
    assert data["creator"] == "Test Creator"
    assert "model_id" in data


async def test_create_model_minimal(client):
    response = await client.post("/models", json={"model_name": "Minimal Model"})
    assert response.status_code == 201
    assert response.json()["model_name"] == "Minimal Model"


async def test_create_model_missing_name(client):
    response = await client.post("/models", json={"creator": "No Name"})
    assert response.status_code == 422


async def test_create_model_resolved_types(client, conn):
    row = await conn.fetchrow("SELECT type_id FROM model_types LIMIT 1")
    type_id = str(row["type_id"])
    response = await client.post("/models", json={"model_name": "Typed Model", "model_type_ids": [type_id]})
    assert response.status_code == 201
    data = response.json()
    assert len(data["model_types"]) == 1
    assert data["model_types"][0]["id"] == type_id


# ---------------------------------------------------------------------------
# UPDATE
# ---------------------------------------------------------------------------

async def test_update_model(client, conn):
    row = await conn.fetchrow(
        "INSERT INTO models (model_name) VALUES ('Update Me') RETURNING model_id"
    )
    response = await client.patch(f"/models/{row['model_id']}", json={"years_active": "2020-2024"})
    assert response.status_code == 200
    assert response.json()["years_active"] == "2020-2024"
    assert response.json()["model_name"] == "Update Me"


async def test_update_model_not_found(client):
    response = await client.patch(f"/models/{uuid4()}", json={"creator": "Ghost"})
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------

async def test_delete_model(client, conn):
    row = await conn.fetchrow(
        "INSERT INTO models (model_name) VALUES ('Delete Me') RETURNING model_id"
    )
    response = await client.delete(f"/models/{row['model_id']}")
    assert response.status_code == 204


async def test_delete_model_not_found(client):
    response = await client.delete(f"/models/{uuid4()}")
    assert response.status_code == 404


async def test_delete_model_blocked_when_referenced(client, conn):
    # Find a model that is in an effect's model_ids array
    row = await conn.fetchrow(
        "SELECT model_id FROM models m "
        "WHERE EXISTS (SELECT 1 FROM effects e WHERE m.model_id = ANY(e.model_ids)) LIMIT 1"
    )
    if row is None:
        return  # no such fixture data — skip
    response = await client.delete(f"/models/{row['model_id']}")
    assert response.status_code == 409
