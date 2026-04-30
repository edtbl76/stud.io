"""Schema validation tests for the Plugin Scanner tables.

Verifies structure, constraints, and cascade behaviour defined in
sql/scanner_schema.sql. All tests use a rolled-back transaction so no
persistent data is written to masterdb_test.
"""
import pytest


# ---------------------------------------------------------------------------
# Table existence
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_plugin_scans_table_exists(conn):
    row = await conn.fetchrow(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name = 'plugin_scans'"
    )
    assert row is not None


@pytest.mark.asyncio
async def test_plugin_scan_results_table_exists(conn):
    row = await conn.fetchrow(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name = 'plugin_scan_results'"
    )
    assert row is not None


@pytest.mark.asyncio
async def test_scanner_api_keys_table_exists(conn):
    row = await conn.fetchrow(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name = 'scanner_api_keys'"
    )
    assert row is not None


@pytest.mark.asyncio
async def test_scanner_exclusions_table_exists(conn):
    row = await conn.fetchrow(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name = 'scanner_exclusions'"
    )
    assert row is not None


# ---------------------------------------------------------------------------
# Column presence (spot-check key columns)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_plugin_scan_results_has_required_columns(conn):
    rows = await conn.fetch(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'plugin_scan_results'",
    )
    columns = {r['column_name'] for r in rows}
    required = {'result_id', 'scan_id', 'name', 'vendor', 'version',
                'format', 'path', 'status', 'confidence', 'score',
                'record_id', 'record_table', 'confirmed_at', 'confirmed_by'}
    assert required.issubset(columns)


@pytest.mark.asyncio
async def test_scanner_api_keys_has_key_hint_column(conn):
    row = await conn.fetchrow(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'scanner_api_keys' AND column_name = 'key_hint'"
    )
    assert row is not None


@pytest.mark.asyncio
async def test_plugin_scan_results_has_no_deleted_at(conn):
    row = await conn.fetchrow(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'plugin_scan_results' AND column_name = 'deleted_at'"
    )
    assert row is None, "plugin_scan_results must not have deleted_at (hard delete only)"


@pytest.mark.asyncio
async def test_plugin_scans_has_no_deleted_at(conn):
    row = await conn.fetchrow(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'plugin_scans' AND column_name = 'deleted_at'"
    )
    assert row is None, "plugin_scans must not have deleted_at (hard delete only)"


# ---------------------------------------------------------------------------
# Constraints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scanner_exclusions_unique_vendor_name(conn):
    await conn.execute(
        "INSERT INTO scanner_exclusions (vendor, name) VALUES ($1, $2)",
        'Acme Audio', 'Reverb Pro',
    )
    with pytest.raises(Exception, match='unique'):
        await conn.execute(
            "INSERT INTO scanner_exclusions (vendor, name) VALUES ($1, $2)",
            'Acme Audio', 'Reverb Pro',
        )


@pytest.mark.asyncio
async def test_scanner_api_keys_unique_hashed_key(conn):
    await conn.execute(
        "INSERT INTO scanner_api_keys (label, key_hint, hashed_key) VALUES ($1, $2, $3)",
        'Test Key', 'a3f2', 'hash_abc123',
    )
    with pytest.raises(Exception, match='unique'):
        await conn.execute(
            "INSERT INTO scanner_api_keys (label, key_hint, hashed_key) VALUES ($1, $2, $3)",
            'Other Key', 'b4e1', 'hash_abc123',
        )


@pytest.mark.asyncio
async def test_plugin_scan_results_not_null_columns(conn):
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) "
        "VALUES ($1, $2) RETURNING scan_id",
        'test-machine', 5,
    )
    with pytest.raises(Exception):
        await conn.execute(
            "INSERT INTO plugin_scan_results "
            "(scan_id, name, vendor, version, format, path, status) "
            "VALUES ($1, NULL, $2, $3, $4, $5, $6)",
            scan_id, 'Acme', '1.0', 'vst3', '/path', 'untracked',
        )


# ---------------------------------------------------------------------------
# FK CASCADE
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scan_results_cascade_delete(conn):
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) "
        "VALUES ($1, $2) RETURNING scan_id",
        'test-machine', 1,
    )
    await conn.execute(
        "INSERT INTO plugin_scan_results "
        "(scan_id, name, vendor, version, format, path, status) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7)",
        scan_id, 'Reverb Pro', 'Acme Audio', '1.0', 'vst3', '/path/reverb.vst3', 'untracked',
    )
    count_before = await conn.fetchval(
        "SELECT COUNT(*) FROM plugin_scan_results WHERE scan_id = $1", scan_id
    )
    assert count_before == 1

    await conn.execute("DELETE FROM plugin_scans WHERE scan_id = $1", scan_id)

    count_after = await conn.fetchval(
        "SELECT COUNT(*) FROM plugin_scan_results WHERE scan_id = $1", scan_id
    )
    assert count_after == 0, "Results must be cascade-deleted with their parent scan"
