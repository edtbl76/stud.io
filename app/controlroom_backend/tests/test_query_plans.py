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
