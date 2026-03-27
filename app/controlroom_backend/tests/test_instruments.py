from uuid import uuid4


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
