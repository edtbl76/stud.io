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


# ── /search/entities ──────────────────────────────────────────────────────────


async def test_entity_search_response_shape(client, conn):
    await conn.execute("INSERT INTO effects (effect_name) VALUES ('zebraentity effect')")
    res = await client.get("/search/entities?q=zebraentity")
    assert res.status_code == 200
    body = res.json()
    assert "results" in body
    assert isinstance(body["results"], list)


async def test_entity_search_result_fields(client, conn):
    await conn.execute("INSERT INTO effects (effect_name) VALUES ('zebrafields effect')")
    res = await client.get("/search/entities?q=zebrafields")
    result = res.json()["results"][0]
    assert "table_name" in result
    assert "id" in result
    assert "name" in result
    assert "brand_name" in result


async def test_entity_search_finds_effect(client, conn):
    await conn.execute("INSERT INTO effects (effect_name) VALUES ('zebraeffect reverb')")
    res = await client.get("/search/entities?q=zebraeffect")
    body = res.json()
    assert any(r["name"] == "zebraeffect reverb" and r["table_name"] == "effects" for r in body["results"])


async def test_entity_search_finds_instrument(client, conn):
    await conn.execute("INSERT INTO instruments (instrument_name) VALUES ('zebrainst piano')")
    res = await client.get("/search/entities?q=zebrainst")
    body = res.json()
    assert any(r["table_name"] == "instruments" for r in body["results"])


async def test_entity_search_finds_library(client, conn):
    await conn.execute("INSERT INTO libraries (library_name) VALUES ('zebralib pack')")
    res = await client.get("/search/entities?q=zebralib")
    body = res.json()
    assert any(r["table_name"] == "libraries" for r in body["results"])


async def test_entity_search_empty_query_returns_empty(client):
    res = await client.get("/search/entities?q=")
    assert res.status_code == 200
    assert res.json()["results"] == []


async def test_entity_search_no_query_param_returns_empty(client):
    res = await client.get("/search/entities")
    assert res.status_code == 200
    assert res.json()["results"] == []


async def test_entity_search_excludes_record(client, conn):
    effect_id = await conn.fetchval(
        "INSERT INTO effects (effect_name) VALUES ('zebraexclude fx') RETURNING effect_id"
    )
    res = await client.get(
        f"/search/entities?q=zebraexclude&exclude_table=effects&exclude_id={effect_id}"
    )
    body = res.json()
    assert not any(str(r["id"]) == str(effect_id) for r in body["results"])


async def test_entity_search_nil_exclude_id_matches_nothing(client, conn):
    await conn.execute("INSERT INTO effects (effect_name) VALUES ('zebranilexclude fx')")
    nil_uuid = "00000000-0000-0000-0000-000000000000"
    res = await client.get(
        f"/search/entities?q=zebranilexclude&exclude_table=effects&exclude_id={nil_uuid}"
    )
    body = res.json()
    assert len(body["results"]) > 0


async def test_entity_search_substring_match(client, conn):
    await conn.execute("INSERT INTO effects (effect_name) VALUES ('zebrasubstr chorus')")
    res = await client.get("/search/entities?q=substr")
    body = res.json()
    assert any("substr" in r["name"] for r in body["results"])
