"""Tests for the global FTS search endpoint."""


async def test_search_response_shape(client, conn):
    await conn.execute("INSERT INTO brands (brand_name) VALUES ('zebrasearch brand')")
    res = await client.get("/search?q=zebrasearch")
    assert res.status_code == 200
    body = res.json()
    assert "results" in body
    assert "total" in body
    assert isinstance(body["results"], list)
    assert isinstance(body["total"], int)


async def test_search_result_fields(client, conn):
    await conn.execute("INSERT INTO brands (brand_name) VALUES ('zebrasearch brand')")
    res = await client.get("/search?q=zebrasearch")
    result = res.json()["results"][0]
    assert "table" in result
    assert "id" in result
    assert "name" in result
    assert "rank" in result


async def test_search_finds_brand(client, conn):
    await conn.execute("INSERT INTO brands (brand_name) VALUES ('zebrasearch brand')")
    res = await client.get("/search?q=zebrasearch")
    body = res.json()
    assert body["total"] > 0
    assert any(r["name"] == "zebrasearch brand" for r in body["results"])


async def test_search_no_match(client):
    res = await client.get("/search?q=zzznomatchzzz")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 0
    assert body["results"] == []


async def test_search_spans_multiple_tables(client, conn):
    brand_id = await conn.fetchval(
        "INSERT INTO brands (brand_name) VALUES ('zebraspan brand') RETURNING brand_id"
    )
    await conn.execute(
        "INSERT INTO effects (effect_name, brand_id) VALUES ('zebraspan effect', $1)",
        brand_id,
    )
    res = await client.get("/search?q=zebraspan")
    body = res.json()
    tables = {r["table"] for r in body["results"]}
    assert "brands" in tables
    assert "effects" in tables


async def test_search_query_too_short(client):
    res = await client.get("/search?q=x")
    assert res.status_code == 422


async def test_search_missing_query(client):
    res = await client.get("/search")
    assert res.status_code == 422


async def test_search_notes_mode_includes_description(client, conn):
    await conn.execute(
        "INSERT INTO brands (brand_name, description)"
        " VALUES ('NotesBrand', 'uniquedescriptionword')"
    )
    core = await client.get("/search?q=uniquedescriptionword&notes=false")
    assert core.json()["total"] == 0

    with_notes = await client.get("/search?q=uniquedescriptionword&notes=true")
    assert with_notes.json()["total"] > 0


async def test_search_limit_respected(client, conn):
    for i in range(3):
        await conn.execute(
            "INSERT INTO brands (brand_name) VALUES ($1)", f"limittest brand {i}"
        )
    res = await client.get("/search?q=limittest&limit=2")
    body = res.json()
    assert len(body["results"]) <= 2
    assert body["total"] == 3
