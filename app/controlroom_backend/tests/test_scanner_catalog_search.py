"""Integration tests for GET /scanner/catalog/search."""
from __future__ import annotations

import pytest

NUM_INSERTS = 25
RESULT_LIMIT = 20


async def _insert_effect(conn, name: str) -> str:
    return str(await conn.fetchval(
        "INSERT INTO effects (effect_name) VALUES ($1) RETURNING effect_id", name
    ))


@pytest.mark.asyncio
async def test_catalog_search_returns_matching_results(client, conn, auth_headers):
    unique_name = "ZZZ_CatSearch_Reverb_UNIQUE"
    await _insert_effect(conn, unique_name)

    resp = await client.get(f"/scanner/catalog/search?q={unique_name}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == unique_name
    assert data[0]["record_table"] == "effects"


@pytest.mark.asyncio
async def test_catalog_search_filters_by_table(client, conn, auth_headers):
    unique = "ZZZ_TableFilter"
    await _insert_effect(conn, f"{unique} Effect")
    await conn.execute(
        "INSERT INTO instruments (instrument_name) VALUES ($1)", f"{unique} Instrument"
    )

    resp = await client.get(f"/scanner/catalog/search?q={unique}&table=effects", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert all(r["record_table"] == "effects" for r in data)
    assert any(r["name"] == f"{unique} Effect" for r in data)
    assert not any(r["name"] == f"{unique} Instrument" for r in data)


@pytest.mark.asyncio
async def test_catalog_search_returns_empty_for_no_match(client, conn, auth_headers):
    resp = await client.get(
        "/scanner/catalog/search?q=xyznonexistent999", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_catalog_search_requires_auth(client):
    resp = await client.get("/scanner/catalog/search?q=test")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_catalog_search_limits_to_20_results(client, conn, auth_headers):
    for i in range(NUM_INSERTS):
        await conn.execute(
            "INSERT INTO effects (effect_name) VALUES ($1)",
            f"ZZZ_LimitTest {i:02d}",
        )

    resp = await client.get("/scanner/catalog/search?q=ZZZ_LimitTest", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == RESULT_LIMIT
