"""Tests for /config/<slug> — all 7 lookup tables."""
import pytest
from uuid import uuid4

SLUGS = [
    "entity-types",
    "tag-types",
    "plugin-formats",
    "model-types",
    "effect-types",
    "instrument-types",
    "tool-types",
]


@pytest.mark.parametrize("slug", SLUGS)
async def test_list_lookup(client, slug):
    response = await client.get(f"/config/{slug}")
    assert response.status_code == 200
    items = response.json()
    assert isinstance(items, list)
    assert len(items) > 0


@pytest.mark.parametrize("slug", SLUGS)
async def test_list_lookup_fields(client, slug):
    item = (await client.get(f"/config/{slug}")).json()[0]
    assert "type_id" in item
    assert "type_name" in item


async def test_get_lookup(client, conn):
    row = await conn.fetchrow("SELECT type_id FROM tag_types LIMIT 1")
    response = await client.get(f"/config/tag-types/{row['type_id']}")
    assert response.status_code == 200
    assert response.json()["type_id"] == str(row["type_id"])


async def test_get_lookup_not_found(client):
    response = await client.get(f"/config/tag-types/{uuid4()}")
    assert response.status_code == 404


async def test_unknown_slug(client):
    response = await client.get("/config/nonexistent-table")
    assert response.status_code == 404


async def test_create_lookup(client, admin_headers):
    response = await client.post("/config/tag-types", json={"type_name": "Test Tag Type"}, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["type_name"] == "Test Tag Type"
    assert "type_id" in data


async def test_create_lookup_minimal(client, admin_headers):
    response = await client.post("/config/effect-types", json={"type_name": "Test Effect Type"}, headers=admin_headers)
    assert response.status_code == 201


async def test_create_lookup_missing_name(client, admin_headers):
    response = await client.post("/config/tag-types", json={"type_description": "No name"}, headers=admin_headers)
    assert response.status_code == 422


async def test_update_lookup(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO tool_types (type_name) VALUES ('Update Me Type') RETURNING type_id"
    )
    response = await client.patch(
        f"/config/tool-types/{row['type_id']}",
        json={"type_description": "Updated description"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["type_description"] == "Updated description"


async def test_update_lookup_not_found(client, admin_headers):
    response = await client.patch(f"/config/tag-types/{uuid4()}", json={"type_name": "Ghost"}, headers=admin_headers)
    assert response.status_code == 404


async def test_delete_lookup(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO tag_types (type_name) VALUES ('Delete Me Tag') RETURNING type_id"
    )
    response = await client.delete(f"/config/tag-types/{row['type_id']}", headers=admin_headers)
    assert response.status_code == 204


async def test_delete_lookup_not_found(client, admin_headers):
    response = await client.delete(f"/config/tag-types/{uuid4()}", headers=admin_headers)
    assert response.status_code == 404


async def test_delete_lookup_blocked_when_referenced(client, conn, admin_headers):
    # Find a tag_type that is referenced by at least one record
    row = await conn.fetchrow(
        "SELECT DISTINCT t.type_id FROM tag_types t "
        "JOIN effects e ON t.type_id = ANY(e.tag_ids) LIMIT 1"
    )
    if row is None:
        return  # no fixture data — skip
    response = await client.delete(f"/config/tag-types/{row['type_id']}", headers=admin_headers)
    assert response.status_code == 409
