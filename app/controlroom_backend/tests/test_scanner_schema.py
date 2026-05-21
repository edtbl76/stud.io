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
async def test_scanner_plugin_links_table_exists(conn):
    row = await conn.fetchrow(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_name = 'scanner_plugin_links'"
    )
    assert row is not None


@pytest.mark.asyncio
async def test_scanner_plugin_links_unique_fingerprint(conn):
    await conn.execute(
        "INSERT INTO scanner_plugin_links "
        "(scanned_vendor, scanned_name, fingerprint, record_id, record_table, confirmed_by) "
        "VALUES ($1, $2, $3, $4, $5, $6)",
        'Acme Audio', 'Reverb Pro', 'acme audio reverb pro',
        '00000000-0000-0000-0000-000000000001', 'effects', 'admin',
    )
    with pytest.raises(Exception, match='unique'):
        await conn.execute(
            "INSERT INTO scanner_plugin_links "
            "(scanned_vendor, scanned_name, fingerprint, record_id, record_table, confirmed_by) "
            "VALUES ($1, $2, $3, $4, $5, $6)",
            'Acme Audio', 'Reverb Pro', 'acme audio reverb pro',
            '00000000-0000-0000-0000-000000000002', 'effects', 'admin',
        )


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


# ---------------------------------------------------------------------------
# U-01 rewrite: new rule tables
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_vendor_rule_insert_and_select(conn):
    rule_id = await conn.fetchval(
        "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) "
        "VALUES ($1, $2, $3) RETURNING rule_id",
        "ikmultimedia", "IK Multimedia", "admin",
    )
    row = await conn.fetchrow(
        "SELECT disk_vendor, catalog_vendor, enabled, created_by "
        "FROM scanner_vendor_rules WHERE rule_id = $1", rule_id,
    )
    assert row["disk_vendor"] == "ikmultimedia"
    assert row["catalog_vendor"] == "IK Multimedia"
    assert row["enabled"] is True
    assert row["created_by"] == "admin"


@pytest.mark.asyncio
async def test_vendor_rule_duplicate_disk_vendor_raises(conn):
    await conn.execute(
        "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) "
        "VALUES ($1, $2, $3)", "uaudio", "Universal Audio", "admin",
    )
    with pytest.raises(Exception, match="unique"):
        await conn.execute(
            "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) "
            "VALUES ($1, $2, $3)", "uaudio", "Universal Audio 2", "admin",
        )


@pytest.mark.asyncio
async def test_name_rule_insert_and_select(conn):
    rule_id = await conn.fetchval(
        "INSERT INTO scanner_name_rules (disk_name, catalog_name, created_by) "
        "VALUES ($1, $2, $3) RETURNING rule_id",
        "bx_farts", "bx_farts", "admin",
    )
    row = await conn.fetchrow(
        "SELECT disk_name, catalog_name, enabled FROM scanner_name_rules WHERE rule_id = $1",
        rule_id,
    )
    assert row["disk_name"] == "bx_farts"
    assert row["catalog_name"] == "bx_farts"
    assert row["enabled"] is True


@pytest.mark.asyncio
async def test_name_rule_duplicate_disk_name_raises(conn):
    await conn.execute(
        "INSERT INTO scanner_name_rules (disk_name, catalog_name, created_by) "
        "VALUES ($1, $2, $3)", "Delay Lab", "Delay Lab", "admin",
    )
    with pytest.raises(Exception, match="unique"):
        await conn.execute(
            "INSERT INTO scanner_name_rules (disk_name, catalog_name, created_by) "
            "VALUES ($1, $2, $3)", "Delay Lab", "Delay Lab 2", "admin",
        )


@pytest.mark.asyncio
async def test_pattern_rule_insert_and_select(conn):
    rule_id = await conn.fetchval(
        "INSERT INTO scanner_name_patterns "
        "(label, pattern, match_fields, action, enabled, is_seeded, created_by) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING rule_id",
        "Surround variant", "{name}(surround)", ["vendor", "version", "format"],
        "alias_to_match", False, False, "admin",
    )
    row = await conn.fetchrow(
        "SELECT label, pattern, match_fields, action, enabled, is_seeded "
        "FROM scanner_name_patterns WHERE rule_id = $1", rule_id,
    )
    assert row["label"] == "Surround variant"
    assert row["pattern"] == "{name}(surround)"
    assert set(row["match_fields"]) == {"vendor", "version", "format"}
    assert row["action"] == "alias_to_match"
    assert row["enabled"] is False
    assert row["is_seeded"] is False


@pytest.mark.asyncio
async def test_pattern_rule_invalid_action_raises(conn):
    with pytest.raises(Exception, match="check"):
        await conn.execute(
            "INSERT INTO scanner_name_patterns "
            "(label, pattern, match_fields, action, created_by) "
            "VALUES ($1, $2, $3, $4, $5)",
            "Bad rule", "{name}(x)", ["vendor"], "invalid_action", "admin",
        )


@pytest.mark.asyncio
async def test_name_alias_insert_and_select(conn):
    import uuid
    record_id = uuid.uuid4()
    alias_id = await conn.fetchval(
        "INSERT INTO scanner_name_aliases "
        "(disk_name, catalog_record_id, catalog_table, created_by) "
        "VALUES ($1, $2, $3, $4) RETURNING alias_id",
        "Helix Native (m)", record_id, "effects", "admin",
    )
    row = await conn.fetchrow(
        "SELECT disk_name, catalog_record_id, catalog_table "
        "FROM scanner_name_aliases WHERE alias_id = $1", alias_id,
    )
    assert row["disk_name"] == "Helix Native (m)"
    assert row["catalog_record_id"] == record_id
    assert row["catalog_table"] == "effects"


@pytest.mark.asyncio
async def test_name_alias_duplicate_disk_name_raises(conn):
    import uuid
    record_id = uuid.uuid4()
    await conn.execute(
        "INSERT INTO scanner_name_aliases (disk_name, catalog_record_id, catalog_table, created_by) "
        "VALUES ($1, $2, $3, $4)", "Helix Native (m)", record_id, "effects", "admin",
    )
    with pytest.raises(Exception, match="unique"):
        await conn.execute(
            "INSERT INTO scanner_name_aliases (disk_name, catalog_record_id, catalog_table, created_by) "
            "VALUES ($1, $2, $3, $4)", "Helix Native (m)", uuid.uuid4(), "effects", "admin",
        )


@pytest.mark.asyncio
async def test_new_status_values_accepted(conn):
    scan_id = await conn.fetchval(
        "INSERT INTO plugin_scans (source_machine, total_count) VALUES ($1, $2) RETURNING scan_id",
        "test-machine", 1,
    )
    for status in ("unlinked", "needs_review", "excluded"):
        await conn.execute(
            "INSERT INTO plugin_scan_results "
            "(scan_id, name, vendor, version, format, path, status) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7)",
            scan_id, "Test Plugin", "Test Vendor", "1.0", "vst3", "/test.vst3", status,
        )


@pytest.mark.asyncio
async def test_mono_variant_seed_exists(conn):
    row = await conn.fetchrow(
        "SELECT label, pattern, match_fields, action, enabled, is_seeded "
        "FROM scanner_name_patterns WHERE is_seeded = TRUE AND label = $1",
        "Mono variant",
    )
    assert row is not None, "Mono Variant seed rule not found"
    assert row["pattern"] == "{name}(m)"
    assert "vendor" in list(row["match_fields"])
    assert "version" in list(row["match_fields"])
    assert "format" in list(row["match_fields"])
    assert row["action"] == "alias_to_match"
    assert row["enabled"] is False
    assert row["is_seeded"] is True
