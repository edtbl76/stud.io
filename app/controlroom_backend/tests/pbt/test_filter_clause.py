"""
Property-based tests for build_filter_clause, build_value_free_sql,
and _build_order_clause using Hypothesis.
"""
from hypothesis import given, settings
from hypothesis import strategies as st

from routers._crud_ops import build_filter_clause, _build_order_clause
from routers.filter_operators import (
    FilterEntry,
    FilterableField,
    build_value_free_sql,
    VALUE_FREE_OPERATORS,
)

# ── Strategies ────────────────────────────────────────────────────────────────

col_name = st.from_regex(r'[a-z][a-z0-9_]{0,15}', fullmatch=True)

field_def_st = st.builds(
    FilterableField,
    contains_expr=st.one_of(st.none(), col_name.map(lambda c: f"{c} ILIKE {{val}}")),
    col_expr=st.one_of(st.none(), col_name),
    empty_expr=st.one_of(st.none(), col_name.map(lambda c: f"array_length({c}, 1) = 0")),
)

value_st = st.text(min_size=1, max_size=50)

filter_entry_st = st.one_of(
    st.builds(FilterEntry, value=value_st, operator=st.just("contains")),
    st.builds(FilterEntry, value=value_st, operator=st.just("equals")),
    st.builds(FilterEntry, value=value_st, operator=st.just("fuzzy")),
    st.builds(FilterEntry, value=st.just(""), operator=st.just("is_empty")),
    st.builds(FilterEntry, value=st.just(""), operator=st.just("is_not_empty")),
    st.builds(FilterEntry, value=st.just("2024-01-01"), operator=st.just("date_on")),
    st.builds(FilterEntry, value=st.just("2024-01-01"), operator=st.just("date_before")),
    st.builds(FilterEntry, value=st.just("2024-01-01"), operator=st.just("date_after")),
    st.builds(
        FilterEntry,
        value=st.just("2024-01-01"),
        operator=st.just("date_between"),
        value_end=st.just("2024-12-31"),
    ),
)

filterable_st = st.dictionaries(col_name, field_def_st, min_size=0, max_size=5)
filters_st = st.dictionaries(col_name, filter_entry_st, min_size=0, max_size=5)


# ── build_filter_clause ───────────────────────────────────────────────────────

@given(filterable_st, filters_st)
@settings(max_examples=200)
def test_empty_filters_produce_no_where_clause(filterable, filters):
    """No filters → empty WHERE clause and empty bind values."""
    where, values = build_filter_clause(filterable, {})
    assert where == ""
    assert values == []


@given(filterable_st, filters_st)
@settings(max_examples=200)
def test_where_clause_present_iff_parts_nonempty(filterable, filters):
    """WHERE appears iff at least one filter matched a filterable field."""
    where, values = build_filter_clause(filterable, filters)
    if where:
        assert where.startswith("WHERE ")
    else:
        assert values == []


@given(filterable_st, filters_st)
@settings(max_examples=200)
def test_unknown_filter_keys_silently_ignored(filterable, filters):
    """Filters with keys not in filterable are silently dropped."""
    # Use a filterable with no keys — all filters are unknown.
    where, values = build_filter_clause({}, filters)
    assert where == ""
    assert values == []


@given(filterable_st, filters_st)
@settings(max_examples=200)
def test_bind_param_indices_are_contiguous(filterable, filters):
    """Bind params in the WHERE clause are $1, $2, ... without gaps."""
    where, values = build_filter_clause(filterable, filters)
    if not where:
        return
    # Count $N references in the SQL fragment.
    import re
    indices = [int(m) for m in re.findall(r'\$(\d+)', where)]
    if indices:
        assert sorted(indices) == list(range(1, len(values) + 1))


@given(filterable_st, filters_st)
@settings(max_examples=200)
def test_value_free_operators_contribute_no_bind_values(filterable, filters):
    """is_empty and is_not_empty never add bind values."""
    vf_only = {k: v for k, v in filters.items() if v.operator in VALUE_FREE_OPERATORS}
    where, values = build_filter_clause(filterable, vf_only)
    assert values == []


# ── build_value_free_sql ──────────────────────────────────────────────────────

@given(field_def_st)
@settings(max_examples=200)
def test_is_empty_returns_none_when_no_col_or_empty_expr(field_def):
    """Returns None only when both col_expr and empty_expr are absent."""
    result = build_value_free_sql(field_def, "is_empty")
    if field_def.empty_expr is None and field_def.col_expr is None:
        assert result is None
    else:
        assert result is not None


@given(field_def_st)
@settings(max_examples=200)
def test_is_not_empty_negates_is_empty(field_def):
    """is_not_empty wraps is_empty expression in NOT (...)."""
    if field_def.empty_expr is not None:
        result = build_value_free_sql(field_def, "is_not_empty")
        assert result is not None
        assert result.startswith("NOT (")


# ── _build_order_clause ───────────────────────────────────────────────────────

sortable_st = st.frozensets(col_name, min_size=1, max_size=8)
sort_keys_st = st.lists(col_name, min_size=0, max_size=5)
sort_dirs_st = st.lists(st.sampled_from(["asc", "desc", "ASC", "DESC"]), min_size=0, max_size=5)


@given(sort_keys_st, sort_dirs_st, sortable_st, col_name)
@settings(max_examples=200)
def test_order_clause_always_starts_with_order_by(sort_by, sort_dir, sortable, default_sort):
    result = _build_order_clause(sort_by, sort_dir, sortable, default_sort)
    assert result.startswith("ORDER BY ")


@given(sort_keys_st, sort_dirs_st, sortable_st, col_name)
@settings(max_examples=200)
def test_only_sortable_columns_appear_in_order_clause(sort_by, sort_dir, sortable, default_sort):
    result = _build_order_clause(sort_by, sort_dir, sortable, default_sort)
    # Extract column names from ORDER BY a ASC, b DESC, ...
    import re
    terms = re.findall(r'ORDER BY (.+)', result)[0].split(', ')
    for term in terms:
        col = term.split()[0]
        assert col in sortable or col == default_sort


@given(sort_keys_st, sort_dirs_st, sortable_st, col_name)
@settings(max_examples=200)
def test_direction_is_always_asc_or_desc(sort_by, sort_dir, sortable, default_sort):
    result = _build_order_clause(sort_by, sort_dir, sortable, default_sort)
    import re
    terms = re.findall(r'ORDER BY (.+)', result)[0].split(', ')
    for term in terms:
        parts = term.split()
        assert len(parts) == 2
        assert parts[1] in ("ASC", "DESC")


@given(sortable_st, col_name)
@settings(max_examples=200)
def test_no_valid_sort_keys_falls_back_to_default(sortable, default_sort):
    """Empty or all-invalid sort_by always falls back to default_sort ASC."""
    # Empty sort_by
    result = _build_order_clause([], [], sortable, default_sort)
    assert result == f"ORDER BY {default_sort} ASC"

    # All-invalid sort_by (keys not in sortable) also falls back to default.
    invalid_keys = ["__invalid1__", "__invalid2__"]
    result = _build_order_clause(invalid_keys, [], sortable, default_sort)
    assert result == f"ORDER BY {default_sort} ASC"
