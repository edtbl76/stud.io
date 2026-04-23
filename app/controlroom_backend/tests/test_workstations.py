from uuid import uuid4


async def test_list_workstations_returns_results(client):
    response = await client.get("/studio/session/workstations")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data and "total" in data
    assert len(data["items"]) > 0


async def test_list_workstations_fields(client):
    item = (await client.get("/studio/session/workstations")).json()["items"][0]
    for field in ("workstation_id", "tool_name", "full_tool_name",
                  "tool_types", "plugin_formats", "tags", "created_at"):
        assert field in item


async def test_list_workstations_search_no_match(client):
    response = await client.get("/studio/session/workstations?filter_name=zzznomatchzzz")
    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["total"] == 0


async def test_get_workstation(client, conn):
    row = await conn.fetchrow("SELECT workstation_id FROM workstations LIMIT 1")
    response = await client.get(f"/studio/session/workstations/{row['workstation_id']}")
    assert response.status_code == 200
    assert response.json()["workstation_id"] == str(row["workstation_id"])


async def test_get_workstation_not_found(client):
    response = await client.get(f"/studio/session/workstations/{uuid4()}")
    assert response.status_code == 404


async def test_create_workstation(client, admin_headers):
    response = await client.post("/studio/session/workstations", json={"tool_name": "Test DAW"}, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["tool_name"] == "Test DAW"
    assert data["tool_types"] == []


async def test_create_workstation_missing_name(client, admin_headers):
    response = await client.post("/studio/session/workstations", json={"version": "1.0"}, headers=admin_headers)
    assert response.status_code == 422


async def test_update_workstation(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO workstations (tool_name) VALUES ('Update Me') RETURNING workstation_id"
    )
    response = await client.patch(f"/studio/session/workstations/{row['workstation_id']}", json={"version": "11.0"}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["version"] == "11.0"


async def test_update_workstation_not_found(client, admin_headers):
    response = await client.patch(f"/studio/session/workstations/{uuid4()}", json={"version": "1.0"}, headers=admin_headers)
    assert response.status_code == 404


async def test_delete_workstation(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO workstations (tool_name) VALUES ('Delete Me') RETURNING workstation_id"
    )
    response = await client.delete(f"/studio/session/workstations/{row['workstation_id']}", headers=admin_headers)
    assert response.status_code == 204


async def test_delete_workstation_not_found(client, admin_headers):
    response = await client.delete(f"/studio/session/workstations/{uuid4()}", headers=admin_headers)
    assert response.status_code == 404
