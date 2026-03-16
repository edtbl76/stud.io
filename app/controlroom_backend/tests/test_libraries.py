from uuid import uuid4


# ---------------------------------------------------------------------------
# LIST
# ---------------------------------------------------------------------------

async def test_list_libraries_returns_results(client, conn):
    await conn.execute("INSERT INTO libraries (library_name) VALUES ('Seed Library')")
    response = await client.get("/libraries")
    assert response.status_code == 200
    assert len(response.json()) > 0


async def test_list_libraries_fields(client, conn):
    await conn.execute("INSERT INTO libraries (library_name) VALUES ('Fields Library')")
    item = (await client.get("/libraries")).json()[0]
    for field in ("library_id", "library_name", "full_library_name",
                  "models", "tags", "parents", "created_at"):
        assert field in item


async def test_list_libraries_search_no_match(client):
    response = await client.get("/libraries?q=zzznomatchzzz")
    assert response.status_code == 200
    assert response.json() == []


# ---------------------------------------------------------------------------
# GET ONE
# ---------------------------------------------------------------------------

async def test_get_library(client, conn):
    row = await conn.fetchrow(
        "INSERT INTO libraries (library_name) VALUES ('Get Me') RETURNING library_id"
    )
    response = await client.get(f"/libraries/{row['library_id']}")
    assert response.status_code == 200
    assert response.json()["library_id"] == str(row["library_id"])


async def test_get_library_not_found(client):
    response = await client.get(f"/libraries/{uuid4()}")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# CREATE
# ---------------------------------------------------------------------------

async def test_create_library(client):
    response = await client.post("/libraries", json={"library_name": "Test Library"})
    assert response.status_code == 201
    data = response.json()
    assert data["library_name"] == "Test Library"
    assert data["models"] == []
    assert data["parents"] == []


async def test_create_library_missing_name(client):
    response = await client.post("/libraries", json={"description": "No name"})
    assert response.status_code == 422


async def test_create_library_with_parent(client, conn):
    parent = await conn.fetchrow(
        "INSERT INTO instruments (instrument_name) VALUES ('Parent Synth') RETURNING instrument_id"
    )
    response = await client.post("/libraries", json={
        "library_name": "Child Library",
        "parent_ids": [{"table_name": "instruments", "id": str(parent["instrument_id"])}],
    })
    assert response.status_code == 201
    data = response.json()
    assert len(data["parents"]) == 1
    assert data["parents"][0]["table_name"] == "instruments"


# ---------------------------------------------------------------------------
# UPDATE
# ---------------------------------------------------------------------------

async def test_update_library(client, conn):
    row = await conn.fetchrow(
        "INSERT INTO libraries (library_name) VALUES ('Update Me') RETURNING library_id"
    )
    response = await client.patch(f"/libraries/{row['library_id']}", json={"description": "Updated"})
    assert response.status_code == 200
    assert response.json()["description"] == "Updated"
    assert response.json()["library_name"] == "Update Me"


async def test_update_library_not_found(client):
    response = await client.patch(f"/libraries/{uuid4()}", json={"description": "Ghost"})
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------

async def test_delete_library(client, conn):
    row = await conn.fetchrow(
        "INSERT INTO libraries (library_name) VALUES ('Delete Me') RETURNING library_id"
    )
    response = await client.delete(f"/libraries/{row['library_id']}")
    assert response.status_code == 204


async def test_delete_library_not_found(client):
    response = await client.delete(f"/libraries/{uuid4()}")
    assert response.status_code == 404
