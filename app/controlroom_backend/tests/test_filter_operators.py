"""
Tests for filter_operators module and build_filter_clause integration.
"""
import pytest
from datetime import date as Date
from routers.filter_operators import (
    FilterEntry,
    FilterableField,
    DEFAULT_OPERATOR,
    VALUE_FREE_OPERATORS,
    DATE_OPERATORS,
    DATE_RANGE_OPERATORS,
    VALID_OPERATORS,
    OPERATOR_BUILDERS,
    _build_equals,
    _build_fuzzy,
    _build_date_on,
    _build_date_before,
    _build_date_after,
    _build_date_between,
    build_value_free_sql,
    _FUZZY_THRESHOLD,
)
from routers._crud_ops import build_filter_clause, parse_filters
from unittest.mock import MagicMock


# ---------------------------------------------------------------------------
# FilterEntry / FilterableField construction
# ---------------------------------------------------------------------------

def test_filter_entry_defaults():
    entry = FilterEntry(value="reverb", operator="contains")
    assert entry.value == "reverb"
    assert entry.operator == "contains"


def test_filter_entry_value_end():
    entry = FilterEntry(value="2024-01-01", operator="date_between", value_end="2024-12-31")
    assert entry.value_end == "2024-12-31"


def test_filterable_field_no_col_expr():
    f = FilterableField("brand_name ILIKE {val}")
    assert f.col_expr is None


def test_filterable_field_with_col_expr():
    f = FilterableField("brand_name ILIKE {val}", col_expr="brand_name")
    assert f.col_expr == "brand_name"


def test_filterable_field_with_empty_expr():
    f = FilterableField(col_expr="tag_ids", empty_expr="cardinality(tag_ids) = 0")
    assert f.empty_expr == "cardinality(tag_ids) = 0"


def test_filter_entry_is_frozen():
    entry = FilterEntry(value="x", operator="contains")
    with pytest.raises(Exception):
        entry.value = "y"  # type: ignore[misc]


def test_filterable_field_is_frozen():
    f = FilterableField("x ILIKE {val}")
    with pytest.raises(Exception):
        f.col_expr = "x"  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Operator builders
# ---------------------------------------------------------------------------

def test_build_equals_returns_exact_match():
    sql, extras = _build_equals("brand_name", 1)
    assert sql == "brand_name = $1"
    assert extras == []


def test_build_fuzzy_returns_similarity():
    sql, extras = _build_fuzzy("effect_name", 2)
    assert f"similarity(effect_name, $2) > {_FUZZY_THRESHOLD}" == sql
    assert extras == []


def test_build_date_on():
    sql, extras = _build_date_on("created_at", 1)
    assert sql == "DATE(created_at) = $1"
    assert extras == []


def test_build_date_before():
    sql, extras = _build_date_before("created_at", 1)
    assert sql == "DATE(created_at) < $1"
    assert extras == []


def test_build_date_after():
    sql, extras = _build_date_after("created_at", 1)
    assert sql == "DATE(created_at) > $1"
    assert extras == []


def test_build_date_between():
    sql, extras = _build_date_between("created_at", 1)
    assert sql == "DATE(created_at) BETWEEN $1 AND $2"
    assert extras == []


def test_build_value_free_sql_is_empty_with_col_expr():
    f = FilterableField(col_expr="version")
    sql = build_value_free_sql(f, "is_empty")
    assert sql is not None
    assert "IS NULL" in sql
    assert "= ''" in sql


def test_build_value_free_sql_is_not_empty_with_col_expr():
    f = FilterableField(col_expr="version")
    sql = build_value_free_sql(f, "is_not_empty")
    assert sql is not None
    assert "IS NOT NULL" in sql
    assert "<> ''" in sql


def test_build_value_free_sql_uses_empty_expr():
    f = FilterableField(col_expr="tag_ids", empty_expr="(tag_ids IS NULL OR cardinality(tag_ids) = 0)")
    sql = build_value_free_sql(f, "is_empty")
    assert sql == "(tag_ids IS NULL OR cardinality(tag_ids) = 0)"


def test_build_value_free_sql_is_not_empty_negates_empty_expr():
    f = FilterableField(col_expr="tag_ids", empty_expr="(tag_ids IS NULL OR cardinality(tag_ids) = 0)")
    sql = build_value_free_sql(f, "is_not_empty")
    assert sql == "NOT ((tag_ids IS NULL OR cardinality(tag_ids) = 0))"


def test_build_value_free_sql_no_col_expr_returns_none():
    f = FilterableField("EXISTS (SELECT 1 FROM tags WHERE name ILIKE {val})")
    assert build_value_free_sql(f, "is_empty") is None
    assert build_value_free_sql(f, "is_not_empty") is None


def test_operator_builders_has_non_value_free_operators():
    excluded = VALUE_FREE_OPERATORS | {"contains"}
    for op in VALID_OPERATORS - excluded:
        assert op in OPERATOR_BUILDERS, f"Missing builder for {op}"


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

def test_default_operator_is_contains():
    assert DEFAULT_OPERATOR == "contains"


def test_value_free_operators():
    assert "is_empty" in VALUE_FREE_OPERATORS
    assert "is_not_empty" in VALUE_FREE_OPERATORS
    assert "contains" not in VALUE_FREE_OPERATORS
    assert "date_on" not in VALUE_FREE_OPERATORS


def test_date_operators():
    assert "date_on" in DATE_OPERATORS
    assert "date_before" in DATE_OPERATORS
    assert "date_after" in DATE_OPERATORS
    assert "date_between" in DATE_OPERATORS
    assert "contains" not in DATE_OPERATORS


def test_date_range_operators():
    assert "date_between" in DATE_RANGE_OPERATORS
    assert "date_on" not in DATE_RANGE_OPERATORS


# ---------------------------------------------------------------------------
# build_filter_clause
# ---------------------------------------------------------------------------

_BRANDS_FILTERABLE = {
    "name":       FilterableField("brand_name ILIKE {val} OR legal_name ILIKE {val}"),
    "brand_name": FilterableField("brand_name ILIKE {val}", col_expr="brand_name"),
    "version":    FilterableField("version ILIKE {val}",    col_expr="version"),
    "created_at": FilterableField(col_expr="created_at"),
}


def test_build_empty_filters_returns_empty():
    where, vals = build_filter_clause(_BRANDS_FILTERABLE, {})
    assert where == ""
    assert vals == []


def test_build_contains_wraps_value_in_percent():
    entry = FilterEntry(value="ssl", operator="contains")
    where, vals = build_filter_clause(_BRANDS_FILTERABLE, {"brand_name": entry})
    assert "ILIKE $1" in where
    assert vals == ["%ssl%"]
    assert where.startswith("WHERE ")


def test_build_contains_composite_key():
    entry = FilterEntry(value="ssl", operator="contains")
    where, vals = build_filter_clause(_BRANDS_FILTERABLE, {"name": entry})
    assert "brand_name ILIKE $1 OR legal_name ILIKE $1" in where
    assert vals == ["%ssl%"]


def test_build_equals_uses_exact_value():
    entry = FilterEntry(value="Ableton", operator="equals")
    where, vals = build_filter_clause(_BRANDS_FILTERABLE, {"brand_name": entry})
    assert "brand_name = $1" in where
    assert vals == ["Ableton"]


def test_build_fuzzy_binds_value():
    entry = FilterEntry(value="abletun", operator="fuzzy")
    where, vals = build_filter_clause(_BRANDS_FILTERABLE, {"brand_name": entry})
    assert "similarity(brand_name" in where
    assert vals == ["abletun"]


def test_build_is_empty_no_bind_value():
    entry = FilterEntry(value="", operator="is_empty")
    where, vals = build_filter_clause(_BRANDS_FILTERABLE, {"version": entry})
    assert "IS NULL" in where
    assert vals == []


def test_build_is_not_empty_no_bind_value():
    entry = FilterEntry(value="", operator="is_not_empty")
    where, vals = build_filter_clause(_BRANDS_FILTERABLE, {"version": entry})
    assert "IS NOT NULL" in where
    assert vals == []


def test_build_date_on_filter():
    entry = FilterEntry(value="2024-06-01", operator="date_on")
    where, vals = build_filter_clause(_BRANDS_FILTERABLE, {"created_at": entry})
    assert "DATE(created_at) = $1" in where
    assert vals == [Date(2024, 6, 1)]


def test_build_date_between_filter():
    entry = FilterEntry(value="2024-01-01", operator="date_between", value_end="2024-12-31")
    where, vals = build_filter_clause(_BRANDS_FILTERABLE, {"created_at": entry})
    assert "DATE(created_at) BETWEEN $1 AND $2" in where
    assert vals == [Date(2024, 1, 1), Date(2024, 12, 31)]


def test_build_date_between_missing_end_uses_start():
    entry = FilterEntry(value="2024-01-01", operator="date_between")
    where, vals = build_filter_clause(_BRANDS_FILTERABLE, {"created_at": entry})
    assert "BETWEEN $1 AND $2" in where
    assert vals == [Date(2024, 1, 1), Date(2024, 1, 1)]


def test_unknown_key_silently_ignored():
    entry = FilterEntry(value="x", operator="contains")
    where, vals = build_filter_clause(_BRANDS_FILTERABLE, {"unknown_col": entry})
    assert where == ""
    assert vals == []


def test_exists_field_skips_non_contains_operators():
    exists_field = FilterableField(
        "EXISTS (SELECT 1 FROM tags WHERE name ILIKE {val})"
    )  # col_expr=None, empty_expr=None
    filterable = {"tags": exists_field}
    for op in ("equals", "fuzzy", "is_empty", "is_not_empty"):
        entry = FilterEntry(value="x", operator=op)  # type: ignore[arg-type]
        where, vals = build_filter_clause(filterable, {"tags": entry})
        assert where == "", f"Expected empty clause for op={op} on EXISTS field"


def test_multiple_filters_and_combined():
    entries = {
        "brand_name": FilterEntry(value="ssl", operator="contains"),
        "version":    FilterEntry(value="", operator="is_empty"),
    }
    where, vals = build_filter_clause(_BRANDS_FILTERABLE, entries)
    assert where.startswith("WHERE ")
    assert " AND " in where
    assert len(vals) == 1  # only contains binds a value


def test_param_index_increments_per_filter():
    entries = {
        "brand_name": FilterEntry(value="ssl", operator="contains"),
        "version":    FilterEntry(value="2.0", operator="equals"),
    }
    where, vals = build_filter_clause(_BRANDS_FILTERABLE, entries)
    assert "$1" in where
    assert "$2" in where
    assert vals == ["%ssl%", "2.0"]


# ---------------------------------------------------------------------------
# parse_filters
# ---------------------------------------------------------------------------

def _make_request(params: dict[str, str]) -> MagicMock:
    req = MagicMock()
    req.query_params = params
    return req


def test_parse_filters_contains_default():
    req = _make_request({"filter_name": "ssl"})
    result = parse_filters(req)
    assert "name" in result
    assert result["name"].value == "ssl"
    assert result["name"].operator == "contains"


def test_parse_filters_explicit_operator():
    req = _make_request({"filter_name": "ssl", "filter_name_op": "equals"})
    result = parse_filters(req)
    assert result["name"].operator == "equals"


def test_parse_filters_value_free_operator_from_op_param():
    req = _make_request({"filter_version_op": "is_empty"})
    result = parse_filters(req)
    assert "version" in result
    assert result["version"].operator == "is_empty"
    assert result["version"].value == ""


def test_parse_filters_date_between_end_param():
    req = _make_request({
        "filter_created_at": "2024-01-01",
        "filter_created_at_op": "date_between",
        "filter_created_at_end": "2024-12-31",
    })
    result = parse_filters(req)
    assert result["created_at"].operator == "date_between"
    assert result["created_at"].value == "2024-01-01"
    assert result["created_at"].value_end == "2024-12-31"


def test_parse_filters_invalid_operator_ignored():
    req = _make_request({"filter_name": "x", "filter_name_op": "INVALID"})
    result = parse_filters(req)
    assert result["name"].operator == "contains"


def test_parse_filters_empty_value_skipped_for_contains():
    req = _make_request({"filter_name": ""})
    result = parse_filters(req)
    assert "name" not in result


def test_parse_filters_invalid_key_ignored():
    req = _make_request({"filter_UPPER": "x"})
    result = parse_filters(req)
    assert len(result) == 0


def test_parse_filters_non_filter_params_ignored():
    req = _make_request({"limit": "100", "sort_by": "name", "filter_name": "ssl"})
    result = parse_filters(req)
    assert list(result.keys()) == ["name"]


# ---------------------------------------------------------------------------
# HTTP integration tests
# ---------------------------------------------------------------------------

async def test_filter_brands_contains(client):
    resp = await client.get("/studio/catalog/brands?filter_name=ssl")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["items"], list)
    for b in data["items"]:
        combined = ((b.get("brand_name") or "") + " " + (b.get("legal_name") or "")).lower()
        assert "ssl" in combined


async def test_filter_brands_equals(client, conn):
    row = await conn.fetchrow("SELECT brand_name FROM brands LIMIT 1")
    name = row["brand_name"]
    resp = await client.get(f"/studio/catalog/brands?filter_brand_name={name}&filter_brand_name_op=equals")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert all(b["brand_name"] == name for b in items)


async def test_filter_brands_is_empty_legal_name(client):
    resp = await client.get("/studio/catalog/brands?filter_legal_name_op=is_empty")
    assert resp.status_code == 200
    items = resp.json()["items"]
    for b in items:
        assert b.get("legal_name") is None or b.get("legal_name") == ""


async def test_filter_brands_is_not_empty_legal_name(client):
    resp = await client.get("/studio/catalog/brands?filter_legal_name_op=is_not_empty")
    assert resp.status_code == 200
    items = resp.json()["items"]
    for b in items:
        assert b.get("legal_name") is not None and b.get("legal_name") != ""


async def test_filter_fuzzy_returns_results(client, conn):
    row = await conn.fetchrow("SELECT brand_name FROM brands LIMIT 1")
    name = row["brand_name"]
    if not name:
        pytest.skip("No brand_name data")
    typo = name[:max(3, len(name) - 2)]
    resp = await client.get(f"/studio/catalog/brands?filter_brand_name={typo}&filter_brand_name_op=fuzzy")
    assert resp.status_code == 200


async def test_filter_effects_is_empty_version(client):
    resp = await client.get("/effects?filter_version_op=is_empty")
    assert resp.status_code == 200
    items = resp.json()["items"]
    for e in items:
        assert e.get("version") is None or e.get("version") == ""


async def test_filter_effects_is_not_empty_version(client):
    resp = await client.get("/effects?filter_version_op=is_not_empty")
    assert resp.status_code == 200
    items = resp.json()["items"]
    for e in items:
        assert e.get("version") is not None and e.get("version") != ""


async def test_filter_created_at_date_on(client):
    resp = await client.get("/studio/catalog/brands?filter_created_at=2024-01-01&filter_created_at_op=date_on")
    assert resp.status_code == 200


async def test_filter_created_at_date_between(client):
    resp = await client.get(
        "/studio/catalog/brands?filter_created_at=2020-01-01&filter_created_at_op=date_between"
        "&filter_created_at_end=2030-12-31"
    )
    assert resp.status_code == 200
    assert len(resp.json()["items"]) > 0


async def test_filter_unknown_op_falls_back_to_contains(client):
    resp = await client.get("/studio/catalog/brands?filter_brand_name=ssl&filter_brand_name_op=BOGUS")
    assert resp.status_code == 200


async def test_filter_exists_field_equals_ignored(client):
    resp = await client.get("/effects?filter_types=reverb&filter_types_op=equals")
    assert resp.status_code == 200
