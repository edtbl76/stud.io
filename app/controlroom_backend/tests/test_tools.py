"""Tests for /tools/<category> — covers all 5 tool categories."""
import pytest
from uuid import uuid4

CATEGORIES = ["workflow", "measurement", "reference", "composition", "admin"]

# Tables that have seed data (all 5 should, based on generate_seeds.py)
SEEDED_CATEGORIES = CATEGORIES


@pytest.mark.parametrize("category", SEEDED_CATEGORIES)
async def test_list_tools_returns_results(client, category):
    response = await client.get(f"/studio/tools/{category}")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data and "total" in data


@pytest.mark.parametrize("category", SEEDED_CATEGORIES)
async def test_list_tools_fields(client, category):
    response = await client.get(f"/studio/tools/{category}")
    assert response.status_code == 200
    items = response.json()["items"]
    if not items:
        return
    item = items[0]
    for field in ("tool_id", "tool_name", "full_tool_name", "tool_types", "tags", "created_at"):
        assert field in item


async def test_list_tools_search_no_match(client):
    response = await client.get("/studio/tools/workflow?filter_name=zzznomatchzzz")
    assert response.status_code == 200
    assert response.json()["items"] == []
    assert response.json()["total"] == 0


async def test_list_tools_unknown_category(client):
    response = await client.get("/studio/tools/unknown")
    assert response.status_code == 404


@pytest.mark.parametrize("category,table,id_col", [
    ("workflow",    "workflow_tools",    "workflow_tool_id"),
    ("measurement", "measurement_tools", "measurement_tool_id"),
    ("reference",   "reference_tools",   "reference_tool_id"),
    ("composition", "composition_tools", "composition_tool_id"),
    ("admin",       "admin_tools",       "admin_tool_id"),
])
async def test_get_tool(client, conn, category, table, id_col):
    row = await conn.fetchrow(f"SELECT {id_col} FROM {table} LIMIT 1")
    if row is None:
        return
    response = await client.get(f"/studio/tools/{category}/{row[id_col]}")
    assert response.status_code == 200
    assert response.json()["tool_id"] == str(row[id_col])


async def test_get_tool_not_found(client):
    response = await client.get(f"/studio/tools/workflow/{uuid4()}")
    assert response.status_code == 404


@pytest.mark.parametrize("category", CATEGORIES)
async def test_create_tool(client, category, admin_headers):
    response = await client.post(f"/studio/tools/{category}", json={"tool_name": f"Test {category} Tool"}, headers=admin_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["tool_name"] == f"Test {category} Tool"
    assert "tool_id" in data


async def test_create_tool_missing_name(client, admin_headers):
    response = await client.post("/studio/tools/workflow", json={"version": "1.0"}, headers=admin_headers)
    assert response.status_code == 422


async def test_update_tool(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO workflow_tools (tool_name) VALUES ('Update Me') RETURNING workflow_tool_id"
    )
    response = await client.patch(f"/studio/tools/workflow/{row['workflow_tool_id']}", json={"version": "3.0"}, headers=admin_headers)
    assert response.status_code == 200
    assert response.json()["version"] == "3.0"


async def test_update_tool_not_found(client, admin_headers):
    response = await client.patch(f"/studio/tools/workflow/{uuid4()}", json={"version": "1.0"}, headers=admin_headers)
    assert response.status_code == 404


async def test_delete_tool(client, conn, admin_headers):
    row = await conn.fetchrow(
        "INSERT INTO admin_tools (tool_name) VALUES ('Delete Me') RETURNING admin_tool_id"
    )
    response = await client.delete(f"/studio/tools/admin/{row['admin_tool_id']}", headers=admin_headers)
    assert response.status_code == 204


async def test_delete_tool_not_found(client, admin_headers):
    response = await client.delete(f"/studio/tools/workflow/{uuid4()}", headers=admin_headers)
    assert response.status_code == 404
