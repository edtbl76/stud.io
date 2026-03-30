"""Unit tests for _crud_ops helpers: _build_order_clause, _build_null_expr, build_filter_clause, parse_filters."""
from unittest.mock import MagicMock
from routers._crud_ops import _build_order_clause, _build_null_expr, build_filter_clause, parse_filters
from routers.filter_operators import FilterableField, FilterEntry

_SORTABLE = frozenset({"brand_name", "legal_name", "created_at", "updated_at"})
_DEFAULT = "brand_name"


# ---------------------------------------------------------------------------
# _build_order_clause
# ---------------------------------------------------------------------------

def test_order_single_asc():
    result = _build_order_clause(["brand_name"], ["asc"], _SORTABLE, _DEFAULT)
    assert result == "ORDER BY brand_name ASC"


def test_order_single_desc():
    result = _build_order_clause(["brand_name"], ["desc"], _SORTABLE, _DEFAULT)
    assert result == "ORDER BY brand_name DESC"


def test_order_multi_column():
    result = _build_order_clause(
        ["brand_name", "created_at"], ["asc", "desc"], _SORTABLE, _DEFAULT
    )
    assert result == "ORDER BY brand_name ASC, created_at DESC"


def test_order_dir_defaults_to_asc_when_missing():
    result = _build_order_clause(["brand_name", "created_at"], ["desc"], _SORTABLE, _DEFAULT)
    assert result == "ORDER BY brand_name DESC, created_at ASC"


def test_order_invalid_column_skipped():
    result = _build_order_clause(["brand_name", "__bad__"], ["asc", "asc"], _SORTABLE, _DEFAULT)
    assert result == "ORDER BY brand_name ASC"


def test_order_all_invalid_falls_back_to_default():
    result = _build_order_clause(["__bad__", "__worse__"], ["asc", "asc"], _SORTABLE, _DEFAULT)
    assert result == f"ORDER BY {_DEFAULT} ASC"


def test_order_empty_list_falls_back_to_default():
    result = _build_order_clause([], [], _SORTABLE, _DEFAULT)
    assert result == f"ORDER BY {_DEFAULT} ASC"


# ---------------------------------------------------------------------------
# _build_null_expr
# ---------------------------------------------------------------------------

def test_null_expr_single_column():
    tmpl = "legal_name ILIKE {val}"
    result = _build_null_expr(tmpl)
    assert result == "(legal_name IS NULL OR legal_name = '')"


def test_null_expr_compound_template():
    tmpl = "brand_name ILIKE {val} OR legal_name ILIKE {val}"
    result = _build_null_expr(tmpl)
    assert "(brand_name IS NULL OR brand_name = '')" in result
    assert "(legal_name IS NULL OR legal_name = '')" in result


def test_null_expr_no_ilike_returns_empty():
    result = _build_null_expr("some_col = {val}")
    assert result == ""


# ---------------------------------------------------------------------------
# build_filter_clause — empty sentinel
# ---------------------------------------------------------------------------

_COMPOUND_EXPR = "brand_name ILIKE {val} OR legal_name ILIKE {val}"

_FILTERABLE_FIELDS = {
    "legal_name": FilterableField(
        contains_expr="legal_name ILIKE {val}",
        col_expr="legal_name",
    ),
    "name": FilterableField(
        contains_expr=_COMPOUND_EXPR,
        empty_expr=_build_null_expr(_COMPOUND_EXPR),
    ),
}


def test_filter_empty_sentinel_generates_null_expr():
    where, vals = build_filter_clause(
        _FILTERABLE_FIELDS, {"legal_name": FilterEntry(value="", operator="is_empty")}
    )
    assert "IS NULL" in where
    assert vals == []


def test_filter_empty_sentinel_compound():
    where, vals = build_filter_clause(
        _FILTERABLE_FIELDS, {"name": FilterEntry(value="", operator="is_empty")}
    )
    assert "brand_name IS NULL" in where
    assert "legal_name IS NULL" in where
    assert vals == []


def test_filter_normal_value_unaffected():
    where, vals = build_filter_clause(
        _FILTERABLE_FIELDS, {"legal_name": FilterEntry(value="SSL", operator="contains")}
    )
    assert "ILIKE" in where
    assert vals == ["%SSL%"]


def test_filter_exact_value_unaffected():
    where, vals = build_filter_clause(
        _FILTERABLE_FIELDS, {"legal_name": FilterEntry(value="SSL", operator="equals")}
    )
    assert "=" in where
    assert vals == ["SSL"]


def test_filter_unknown_key_ignored():
    where, vals = build_filter_clause(
        _FILTERABLE_FIELDS, {"unknown_key": FilterEntry(value="foo", operator="contains")}
    )
    assert where == ""
    assert vals == []


# ---------------------------------------------------------------------------
# parse_filters — "" sentinel
# ---------------------------------------------------------------------------

def _make_request(params: dict[str, str]):
    mock = MagicMock()
    mock.query_params.items.return_value = params.items()
    return mock


def test_parse_filters_empty_sentinel_becomes_is_empty():
    request = _make_request({"filter_legal_name": '""'})
    result = parse_filters(request)
    assert result["legal_name"].operator == "is_empty"
    assert result["legal_name"].value == ""


def test_parse_filters_normal_value_uses_contains():
    request = _make_request({"filter_legal_name": "SSL"})
    result = parse_filters(request)
    assert result["legal_name"].operator == "contains"
    assert result["legal_name"].value == "SSL"


def test_parse_filters_empty_string_ignored():
    request = _make_request({"filter_legal_name": ""})
    result = parse_filters(request)
    assert "legal_name" not in result
