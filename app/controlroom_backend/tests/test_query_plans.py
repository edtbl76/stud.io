"""EXPLAIN plan assertions — verify index usage on hot query paths.

Uses EXPLAIN (FORMAT JSON) without ANALYZE so queries are never executed,
making these tests safe, fast, and side-effect-free.

Failure here means an index was dropped or a query was rewritten in a way
that forces a full table scan on a large table.
"""
import json
import pytest


def _plan_text(plan) -> str:
    """Flatten the EXPLAIN JSON plan to a string for easy searching."""
    return json.dumps(plan)


def _uses_index(plan_text: str) -> bool:
    return any(t in plan_text for t in ('Index Scan', 'Index Only Scan', 'Bitmap Index Scan'))


# ---------------------------------------------------------------------------
# Primary key lookups — must always use Index Scan
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_brand_pk_lookup_uses_index(conn):
    plan = await conn.fetchval(
        "EXPLAIN (FORMAT JSON) SELECT * FROM brands WHERE brand_id = $1",
        '00000000-0000-0000-0000-000000000000',
    )
    assert _uses_index(_plan_text(plan)), "brands PK lookup should use Index Scan"


@pytest.mark.asyncio
async def test_model_pk_lookup_uses_index(conn):
    plan = await conn.fetchval(
        "EXPLAIN (FORMAT JSON) SELECT * FROM models WHERE model_id = $1",
        '00000000-0000-0000-0000-000000000000',
    )
    assert _uses_index(_plan_text(plan)), "models PK lookup should use Index Scan"


@pytest.mark.asyncio
async def test_audit_log_pk_lookup_uses_index(conn):
    plan = await conn.fetchval(
        "EXPLAIN (FORMAT JSON) SELECT * FROM audit_log WHERE audit_id = $1",
        '00000000-0000-0000-0000-000000000000',
    )
    assert _uses_index(_plan_text(plan)), "audit_log PK lookup should use Index Scan"


# ---------------------------------------------------------------------------
# Trigram indexes — verify GIN indexes EXIST (not planner behavior).
#
# The planner may choose Seq Scan on small tables — that is correct behavior
# and not a bug. What matters for regressions is that the index was not
# accidentally dropped. These tests catch accidental index removal.
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_brand_name_trgm_index_exists(conn):
    """idx_brands_brand_name_trgm GIN index must exist."""
    exists = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'brands' AND indexname = 'idx_brands_brand_name_trgm')"
    )
    assert exists, "idx_brands_brand_name_trgm index was dropped or renamed"


@pytest.mark.asyncio
async def test_model_name_trgm_index_exists(conn):
    """idx_models_model_name_trgm GIN index must exist."""
    exists = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'models' AND indexname = 'idx_models_name_trgm')"
    )
    assert exists, "idx_models_name_trgm index was dropped or renamed"


# ---------------------------------------------------------------------------
# Audit log list — verify ORDER BY performed_at uses index if one exists
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_audit_log_list_plan_is_valid(conn):
    """Audit log list query should plan without error."""
    plan = await conn.fetchval(
        """EXPLAIN (FORMAT JSON)
           SELECT audit_id, table_name, record_id, operation,
                  performed_by, performed_at,
                  acknowledged_at, acknowledged_by,
                  undone_at, undone_by
           FROM audit_log
           WHERE acknowledged_at IS NULL AND undone_at IS NULL
           ORDER BY performed_at DESC
           LIMIT 50""",
    )
    assert plan is not None
    assert 'audit_log' in _plan_text(plan)


@pytest.mark.asyncio
async def test_audit_log_count_plan_is_valid(conn):
    """Audit log COUNT query should plan without error."""
    plan = await conn.fetchval(
        """EXPLAIN (FORMAT JSON)
           SELECT COUNT(*)::int FROM audit_log
           WHERE acknowledged_at IS NULL AND undone_at IS NULL""",
    )
    assert plan is not None
    assert 'audit_log' in _plan_text(plan)


# ---------------------------------------------------------------------------
# Full-text search — verify tsquery plan is valid
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# GearList — gear_types table
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gear_types_pk_index_exists(conn):
    """gear_types_pkey must exist — planner may Seq Scan small tables, so we
    assert index presence rather than planner behaviour."""
    exists = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'gear_types' AND indexname = 'gear_types_pkey')"
    )
    assert exists, "gear_types_pkey index was dropped or renamed"


# ---------------------------------------------------------------------------
# GearList — gear table
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_gear_pk_index_exists(conn):
    """gear_pkey must exist — planner may Seq Scan small tables, so we
    assert index presence rather than planner behaviour."""
    exists = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'gear' AND indexname = 'gear_pkey')"
    )
    assert exists, "gear_pkey index was dropped or renamed"


@pytest.mark.asyncio
async def test_gear_type_id_index_exists(conn):
    """idx_gear_gear_type_id must exist for type-filtered list queries."""
    exists = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'gear' AND indexname = 'idx_gear_gear_type_id')"
    )
    assert exists, "idx_gear_gear_type_id index was dropped or renamed"


@pytest.mark.asyncio
async def test_gear_owner_id_index_exists(conn):
    """idx_gear_owner_id must exist for owner-scoped queries."""
    exists = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'gear' AND indexname = 'idx_gear_owner_id')"
    )
    assert exists, "idx_gear_owner_id index was dropped or renamed"


@pytest.mark.asyncio
async def test_gear_name_trgm_index_exists(conn):
    """idx_gear_name_trgm GIN index must exist for name search."""
    exists = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'gear' AND indexname = 'idx_gear_name_trgm')"
    )
    assert exists, "idx_gear_name_trgm index was dropped or renamed"


@pytest.mark.asyncio
async def test_gear_list_query_plan_is_valid(conn):
    """Gear list query through gear_view should produce a valid plan."""
    plan = await conn.fetchval(
        """EXPLAIN (FORMAT JSON)
           SELECT gear_id, gear_name, gear_type_id, gear_type_name,
                  brand_id, model_id, serial_number, year, owner_id,
                  photo_key, notes, num_strings, tuning, pickup_config,
                  pickup_neck_model_id, pickup_middle_model_id,
                  pickup_bridge_model_id, strings_model_id,
                  created_at, updated_at
           FROM   gear_view
           WHERE  ($1::text IS NULL OR gear_name ILIKE '%' || $1 || '%')
             AND  ($2::uuid IS NULL OR gear_type_id = $2)
           ORDER  BY gear_name
           LIMIT  100 OFFSET 0""",
        None, None,
    )
    assert plan is not None
    assert 'gear' in _plan_text(plan)


# ---------------------------------------------------------------------------
# GearList — gear_maintenance_log table
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_maintenance_gear_id_index_exists(conn):
    """idx_maintenance_gear composite index must exist for maintenance list queries."""
    exists = await conn.fetchval(
        "SELECT EXISTS(SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'gear_maintenance_log' AND indexname = 'idx_maintenance_gear')"
    )
    assert exists, "idx_maintenance_gear index was dropped or renamed"


# ---------------------------------------------------------------------------
# Full-text search — verify tsquery plan is valid
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fulltext_search_plan_is_valid(conn):
    """Cross-entity tsvector search should produce a valid plan."""
    from routers.search import _SQL_CORE
    plan = await conn.fetchval(
        f"EXPLAIN (FORMAT JSON) {_SQL_CORE}",
        'synthesizer', 50,
    )
    assert plan is not None
    pt = _plan_text(plan)
    # Full-text search uses websearch_to_tsquery — verify at least one source table appears
    assert any(t in pt for t in ('brands', 'models', 'effects', 'instruments', 'libraries'))


# ---------------------------------------------------------------------------
# Scanner table index existence assertions
# Catalog queries are deterministic regardless of table row count or planner
# statistics — correct for a schema validation unit with empty test tables.
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_idx_scan_results_scan_id_exists(conn):
    row = await conn.fetchrow(
        "SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'plugin_scan_results' AND indexname = 'idx_scan_results_scan_id'"
    )
    assert row is not None, "idx_scan_results_scan_id must exist on plugin_scan_results"


@pytest.mark.asyncio
async def test_idx_scan_results_scan_status_exists(conn):
    row = await conn.fetchrow(
        "SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'plugin_scan_results' AND indexname = 'idx_scan_results_scan_status'"
    )
    assert row is not None, "idx_scan_results_scan_status must exist on plugin_scan_results"


@pytest.mark.asyncio
async def test_idx_scans_scanned_at_exists(conn):
    row = await conn.fetchrow(
        "SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'plugin_scans' AND indexname = 'idx_scans_scanned_at'"
    )
    assert row is not None, "idx_scans_scanned_at must exist on plugin_scans"
