async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_health_ready(client):
    response = await client.get("/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


async def test_db_connection(conn):
    count = await conn.fetchval("SELECT COUNT(*) FROM effects")
    assert count > 0


async def test_db_lookup_tables(conn):
    for table in ("entity_types", "tag_types", "plugin_formats",
                  "effect_types", "instrument_types", "model_types", "tool_types"):
        count = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
        assert count > 0, f"{table} is empty"


async def test_transaction_rollback_works(conn):
    """Verify that inserts in a test are invisible outside the transaction."""
    await conn.execute(
        "INSERT INTO entity_types (type_id, type_name) VALUES (gen_random_uuid(), '_test_sentinel')"
    )
    count = await conn.fetchval(
        "SELECT COUNT(*) FROM entity_types WHERE type_name = '_test_sentinel'"
    )
    assert count == 1  # visible inside the transaction


async def test_sentinel_not_persisted(conn):
    """After the previous test rolled back, the sentinel row must not exist."""
    count = await conn.fetchval(
        "SELECT COUNT(*) FROM entity_types WHERE type_name = '_test_sentinel'"
    )
    assert count == 0  # rolled back — clean slate
