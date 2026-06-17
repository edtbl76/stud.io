"""Unit tests for the shared scanner_catalog module (U-07 refactor).

These tests pin the extracted surface to behavior-preserving guarantees:
- each query wrapper is SQL string-equal to its legacy constant (BR-U07-02)
- load_rejection_set tri-state (BR-U07-03)
- build_matching_context meta-on-demand (BR-U07-04)
- is_clean_match parity (BLM-U07-06)

The legacy SQL is reconstructed locally (golden snapshot) so the tests do not
depend on the soon-to-be-deleted constants in the router modules.
"""
from __future__ import annotations

import types

import pytest

from routers.scanner_catalog import (
    CATALOG_TABLES,
    absent_query,
    build_catalog_index,
    build_matching_context,
    catalog_index_query,
    catalog_meta_query,
    catalog_search_query,
    is_clean_match,
    load_rejection_set,
    orphaned_query,
)


class _FakeConn:
    """Minimal async stand-in for an asyncpg Connection that records calls."""

    def __init__(self, rows: list[dict] | None = None) -> None:
        self._rows = rows or []
        self.fetch_calls: list[tuple] = []

    async def fetch(self, sql: str, *args):
        self.fetch_calls.append((sql, args))
        return self._rows


# ---------------------------------------------------------------------------
# Golden reconstructions of the five legacy UNION constants
# ---------------------------------------------------------------------------

def _legacy_index() -> str:
    return " UNION ALL ".join(
        f"SELECT {pk}::text AS record_id, '{tbl}' AS record_table, "
        f"{name} AS name, b.brand_name AS vendor, t.version, t.disk_paths "
        f"FROM {tbl} t LEFT JOIN brands b ON t.brand_id = b.brand_id "
        f"WHERE t.deleted_at IS NULL"
        for tbl, (pk, name) in CATALOG_TABLES.items()
    )


def _legacy_meta() -> str:
    return " UNION ALL ".join(
        f"SELECT {pk}::text AS record_id, '{tbl}' AS record_table, "
        f"{name} AS record_name, b.brand_name AS record_vendor, t.version AS record_version, t.disk_paths "
        f"FROM {tbl} t LEFT JOIN brands b ON t.brand_id = b.brand_id WHERE t.deleted_at IS NULL"
        for tbl, (pk, name) in CATALOG_TABLES.items()
    )


def _legacy_orphaned() -> str:
    return " UNION ALL ".join(
        f"SELECT {pk}::text AS record_id, '{tbl}' AS record_table, "
        f"{name} AS name, b.brand_name AS vendor, t.version, t.disk_paths "
        f"FROM {tbl} t LEFT JOIN brands b ON t.brand_id = b.brand_id "
        f"WHERE t.deleted_at IS NULL AND jsonb_array_length(t.disk_paths) > 0"
        for tbl, (pk, name) in CATALOG_TABLES.items()
    )


def _legacy_absent() -> str:
    return " UNION ALL ".join(
        f"SELECT {pk}::text AS record_id, '{tbl}' AS record_table, "
        f"{name} AS name, b.brand_name AS vendor, t.version, t.disk_paths "
        f"FROM {tbl} t LEFT JOIN brands b ON t.brand_id = b.brand_id "
        f"WHERE t.deleted_at IS NULL AND t.disk_paths != '[]'::jsonb"
        for tbl, (pk, name) in CATALOG_TABLES.items()
    )


def _legacy_search() -> str:
    return " UNION ALL ".join(
        f"SELECT {pk}::text AS record_id, '{tbl}' AS record_table, "
        f"{name} AS name, b.brand_name AS vendor, t.version "
        f"FROM {tbl} t LEFT JOIN brands b ON t.brand_id = b.brand_id "
        f"WHERE t.deleted_at IS NULL"
        for tbl, (pk, name) in CATALOG_TABLES.items()
    )


@pytest.mark.parametrize(
    "wrapper, legacy",
    [
        (catalog_index_query, _legacy_index),
        (catalog_meta_query, _legacy_meta),
        (orphaned_query, _legacy_orphaned),
        (absent_query, _legacy_absent),
        (catalog_search_query, _legacy_search),
    ],
)
def test_query_wrapper_matches_legacy(wrapper, legacy) -> None:
    """Each named wrapper emits SQL byte-identical to the constant it replaces."""
    assert wrapper() == legacy()


# ---------------------------------------------------------------------------
# build_catalog_index (BLM-U07-03)
# ---------------------------------------------------------------------------

async def test_build_catalog_index_maps_rows() -> None:
    """Rows map to CatalogRecord with a precomputed lowercased search_key."""
    conn = _FakeConn([
        {
            "record_id": 123,
            "record_table": "effects",
            "name": "BigReverb",
            "vendor": "ACME",
            "version": "1.0",
            "disk_paths": [{"path": "/x"}],
        },
        {
            "record_id": 456,
            "record_table": "instruments",
            "name": None,
            "vendor": None,
            "version": None,
            "disk_paths": None,
        },
    ])
    index = await build_catalog_index(conn)

    assert [r.record_id for r in index] == ["123", "456"]
    assert index[0].search_key == "acme bigreverb"
    assert index[0].disk_paths == [{"path": "/x"}]
    # None name/vendor coalesce to "" (name) and pass through (vendor)
    assert index[1].name == ""
    assert index[1].vendor is None
    assert index[1].search_key == ""
    assert index[1].disk_paths == []


# ---------------------------------------------------------------------------
# load_rejection_set tri-state (BR-U07-03)
# ---------------------------------------------------------------------------

_REJECTION_ROWS = [
    {"fingerprint": "acme reverb", "record_id": "11111111-1111-1111-1111-111111111111"},
    {"fingerprint": "moog bass", "record_id": "22222222-2222-2222-2222-222222222222"},
]


async def test_load_rejection_set_none_loads_all() -> None:
    """fingerprints=None loads every rejection (one unscoped query)."""
    conn = _FakeConn(_REJECTION_ROWS)
    result = await load_rejection_set(conn)
    assert result == {
        ("acme reverb", "11111111-1111-1111-1111-111111111111"),
        ("moog bass", "22222222-2222-2222-2222-222222222222"),
    }
    assert len(conn.fetch_calls) == 1
    sql, args = conn.fetch_calls[0]
    assert sql == "SELECT fingerprint, record_id::text FROM scanner_rejections"
    assert args == ()


async def test_load_rejection_set_empty_list_short_circuits() -> None:
    """fingerprints=[] returns empty WITHOUT querying the DB."""
    conn = _FakeConn(_REJECTION_ROWS)
    result = await load_rejection_set(conn, [])
    assert result == set()
    assert conn.fetch_calls == []  # no query issued


async def test_load_rejection_set_scoped() -> None:
    """A non-empty list issues the scoped ANY($1) query with the fingerprints."""
    conn = _FakeConn(_REJECTION_ROWS[:1])
    result = await load_rejection_set(conn, ["acme reverb"])
    assert result == {("acme reverb", "11111111-1111-1111-1111-111111111111")}
    assert len(conn.fetch_calls) == 1
    sql, args = conn.fetch_calls[0]
    assert "WHERE fingerprint = ANY($1::text[])" in sql
    assert args == (["acme reverb"],)


# ---------------------------------------------------------------------------
# is_clean_match parity (BLM-U07-06)
# ---------------------------------------------------------------------------

def _rec(name, vendor, version):
    return types.SimpleNamespace(name=name, vendor=vendor, version=version)


# Each case: (display_name, display_vendor, version, record, expected)
_CLEAN_MATCH_CASES = [
    ("Reverb", "ACME", "1.0", _rec("Reverb", "ACME", "1.0"), True),
    ("reverb", "acme", "1.0", _rec("Reverb", "ACME", "1.0"), True),   # case-insensitive
    ("Reverb", "ACME", "1.0", _rec("Delay", "ACME", "1.0"), False),   # name differs
    ("Reverb", "ACME", "1.0", _rec("Reverb", "Moog", "1.0"), False),  # vendor differs
    ("Reverb", "ACME", "1.0", _rec("Reverb", "ACME", "2.0"), False),  # version differs
    ("Reverb", "ACME", None, _rec("Reverb", "ACME", None), True),     # both versions None
    ("Reverb", "ACME", None, _rec("Reverb", "ACME", ""), True),       # None vs "" coalesce
]


@pytest.mark.parametrize("case", _CLEAN_MATCH_CASES)
def test_is_clean_match_parity(case) -> None:
    display_name, display_vendor, version, record, expected = case
    assert is_clean_match(display_name, display_vendor, version, record) is expected


# ---------------------------------------------------------------------------
# build_matching_context — meta on demand + fingerprint forwarding (BR-U07-04)
# ---------------------------------------------------------------------------

def _issued(conn: _FakeConn, needle: str) -> bool:
    return any(needle in sql for sql, _ in conn.fetch_calls)


async def test_build_matching_context_no_meta_by_default() -> None:
    """with_meta=False leaves catalog_meta None and issues no meta query."""
    conn = _FakeConn([])
    ctx = await build_matching_context(conn)
    assert ctx.catalog_meta is None
    assert ctx.catalog_index == []
    assert ctx.exclusions == set()
    assert ctx.rejection_set == set()
    assert not _issued(conn, "record_name")  # meta query never ran


async def test_build_matching_context_with_meta() -> None:
    """with_meta=True populates catalog_meta and issues the meta query."""
    conn = _FakeConn([])
    ctx = await build_matching_context(conn, with_meta=True)
    assert ctx.catalog_meta == {}
    assert _issued(conn, "record_name")


async def test_build_matching_context_empty_fingerprints_skips_rejection_query() -> None:
    """fingerprints=[] takes the rejection short-circuit (no scanner_rejections query)."""
    conn = _FakeConn([])
    ctx = await build_matching_context(conn, fingerprints=[])
    assert ctx.rejection_set == set()
    assert not _issued(conn, "scanner_rejections")


async def test_build_matching_context_scoped_fingerprints() -> None:
    """A non-empty fingerprints list forwards to the scoped rejection query."""
    conn = _FakeConn([])
    await build_matching_context(conn, fingerprints=["acme reverb"])
    assert _issued(conn, "WHERE fingerprint = ANY($1::text[])")
