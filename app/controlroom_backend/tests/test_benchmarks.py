"""pytest-benchmark tests for hot code paths.

Uses a module-scoped read-only asyncpg connection so the event loop
and connection setup cost are paid once per module, not per iteration.

These benchmarks produce timing baselines. Run with:
    pytest tests/test_benchmarks.py -v --benchmark-json=/tmp/bench.json
"""
import asyncio
import json
import os
import re

import asyncpg
import pytest

from routers._helpers import _coerce_value, _serializable
from routers._crud_ops import build_filter_clause
from routers.filter_operators import FilterableField, FilterEntry
from routers.search import _SQL_CORE, _SQL_NOTES
from routers._xlsx_build import fetch_lookup_data, fetch_table_rows, build_workbook
from routers._xlsx_import import parse_workbook, validate_import
from routers._xlsx_schema import TABLE_CONFIGS

# ---------------------------------------------------------------------------
# Module-scoped read-only connection
# ---------------------------------------------------------------------------

_worker = os.environ.get("PYTEST_XDIST_WORKER", "")
if _worker:
    _m = re.match(r"gw(\d+)", _worker)
    _db_name = f"controlroomdb_test_{_m.group(1)}" if _m else f"controlroomdb_test_{_worker}"
else:
    _db_name = "controlroomdb_test"

_TEST_DSN = f"postgresql://studio:studio@localhost:5432/{_db_name}"


@pytest.fixture(scope="module")
def bench():
    """Returns (event_loop, asyncpg_connection) for synchronous benchmark wrappers."""
    loop = asyncio.new_event_loop()
    conn = loop.run_until_complete(asyncpg.connect(dsn=_TEST_DSN))
    loop.run_until_complete(
        conn.set_type_codec("json",  encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    )
    loop.run_until_complete(
        conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    )
    yield loop, conn
    loop.run_until_complete(conn.close())
    loop.close()


def _run(loop, coro):
    return loop.run_until_complete(coro)


# ---------------------------------------------------------------------------
# DB benchmarks — catalog list queries
# ---------------------------------------------------------------------------

def test_bench_brands_list(benchmark, bench):
    loop, conn = bench
    benchmark(lambda: _run(loop, conn.fetch(
        "SELECT * FROM brands_view LIMIT 50"
    )))


def test_bench_brands_filtered(benchmark, bench):
    loop, conn = bench
    benchmark(lambda: _run(loop, conn.fetch(
        "SELECT * FROM brands_view WHERE brand_name ILIKE $1 LIMIT 50",
        '%pro%',
    )))


def test_bench_models_list(benchmark, bench):
    loop, conn = bench
    benchmark(lambda: _run(loop, conn.fetch(
        "SELECT * FROM models_view LIMIT 50"
    )))


# ---------------------------------------------------------------------------
# DB benchmarks — full-text search
# ---------------------------------------------------------------------------

def test_bench_search_core(benchmark, bench):
    loop, conn = bench
    benchmark(lambda: _run(loop, conn.fetch(_SQL_CORE, 'pro', 50)))


def test_bench_search_notes(benchmark, bench):
    loop, conn = bench
    benchmark(lambda: _run(loop, conn.fetch(_SQL_NOTES, 'pro', 50)))


# ---------------------------------------------------------------------------
# DB benchmarks — audit log
# ---------------------------------------------------------------------------

def test_bench_audit_log_count(benchmark, bench):
    loop, conn = bench
    benchmark(lambda: _run(loop, conn.fetchval(
        "SELECT COUNT(*)::int FROM audit_log "
        "WHERE acknowledged_at IS NULL AND undone_at IS NULL"
    )))


def test_bench_audit_log_list(benchmark, bench):
    loop, conn = bench
    benchmark(lambda: _run(loop, conn.fetch(
        """SELECT audit_id, table_name, record_id, operation,
                  performed_by, performed_at,
                  acknowledged_at, acknowledged_by,
                  undone_at, undone_by
           FROM audit_log
           WHERE acknowledged_at IS NULL AND undone_at IS NULL
           ORDER BY performed_at DESC
           LIMIT 50 OFFSET 0"""
    )))


# ---------------------------------------------------------------------------
# DB benchmarks — xlsx helpers
# ---------------------------------------------------------------------------

def test_bench_fetch_lookup_data(benchmark, bench):
    loop, conn = bench
    benchmark(lambda: _run(loop, fetch_lookup_data(conn)))


def test_bench_fetch_table_rows_brands(benchmark, bench):
    loop, conn = bench
    config = TABLE_CONFIGS["brands"]
    benchmark(lambda: _run(loop, fetch_table_rows(conn, config)))


# ---------------------------------------------------------------------------
# Pure-Python benchmarks (no DB)
# ---------------------------------------------------------------------------

def test_bench_build_filter_clause(benchmark):
    filterable: dict[str, FilterableField] = {
        "brand_name": FilterableField("brand_name ILIKE {val}", col_expr="brand_name"),
        "entity_type": FilterableField("entity_type_name ILIKE {val}", col_expr="entity_type_name"),
        "created_at": FilterableField(col_expr="created_at"),
    }
    filters = {
        "brand_name": FilterEntry(value="pro",   operator="contains"),
        "entity_type": FilterEntry(value="daw",  operator="contains"),
    }
    benchmark(build_filter_clause, filterable, filters)


def test_bench_serializable(benchmark):
    import uuid
    from datetime import datetime, timezone
    row = {
        "model_id":   uuid.uuid4(),
        "model_name": "SomeSynth Pro",
        "brand_id":   uuid.uuid4(),
        "created_at": datetime.now(tz=timezone.utc),
        "updated_at": datetime.now(tz=timezone.utc),
        "deleted_at": None,
        "model_type_ids": [uuid.uuid4(), uuid.uuid4()],
    }
    benchmark(_serializable, row)


def test_bench_coerce_value_uuid_list(benchmark):
    uuids = [str(__import__('uuid').uuid4()) for _ in range(10)]
    benchmark(_coerce_value, uuids)


# ---------------------------------------------------------------------------
# xlsx benchmarks (pre-fetched data)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def xlsx_fixtures(bench):
    """Pre-fetch lookup data and a minimal workbook for xlsx benchmarks."""
    loop, conn = bench
    lookup = _run(loop, fetch_lookup_data(conn))
    brands_rows = _run(loop, fetch_table_rows(conn, TABLE_CONFIGS["brands"]))
    workbook_bytes = build_workbook(
        ["brands"],
        {"brands": brands_rows},
        lookup,
        is_template=False,
    )
    return lookup, brands_rows, workbook_bytes


def test_bench_build_workbook(benchmark, xlsx_fixtures):
    lookup, brands_rows, _ = xlsx_fixtures
    benchmark(
        build_workbook,
        ["brands"],
        {"brands": brands_rows},
        lookup,
        False,
    )


def test_bench_parse_workbook(benchmark, xlsx_fixtures):
    _, _, workbook_bytes = xlsx_fixtures
    benchmark(parse_workbook, workbook_bytes)


def test_bench_validate_import(benchmark, xlsx_fixtures):
    lookup, _, workbook_bytes = xlsx_fixtures
    parsed = parse_workbook(workbook_bytes)
    benchmark(validate_import, parsed, lookup)
