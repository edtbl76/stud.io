async def test_search_returns_results(client):
    response = await client.get("/search?q=ss")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    assert len(response.json()) > 0


async def test_search_result_fields(client):
    results = (await client.get("/search?q=ss")).json()
    result = results[0]
    assert "table" in result
    assert "id" in result
    assert "name" in result


async def test_search_no_match(client):
    response = await client.get("/search?q=zzznomatchzzz")
    assert response.status_code == 200
    assert response.json() == []


async def test_search_spans_multiple_tables(client):
    results = (await client.get("/search?q=ss")).json()
    tables = {r["table"] for r in results}
    assert len(tables) > 1


async def test_search_query_too_short(client):
    response = await client.get("/search?q=x")
    assert response.status_code == 422


async def test_search_missing_query(client):
    response = await client.get("/search")
    assert response.status_code == 422
