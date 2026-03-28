"""
Filter operator types and SQL builder dispatch table.

FilterableField describes a filterable column:
  contains_expr: ILIKE template with {val} placeholder (None = contains unsupported, e.g. dates).
  col_expr:      bare column reference for scalar/date operators; None for EXISTS subquery fields.
  empty_expr:    custom SQL for is_empty (e.g. array columns). is_not_empty negates it.
                 Defaults to standard NULL/empty-string check when col_expr is set.

Wire format:
  filter_<key>=value             (operator defaults to 'contains')
  filter_<key>_op=operator       (explicit operator override)
  filter_<key>_end=value         (second bound for date_between)
  Value-free operators send only filter_<key>_op with no value param.
"""
from dataclasses import dataclass
from typing import Any, Callable, Literal

FilterOperator = Literal[
    "contains", "equals", "fuzzy",
    "is_empty", "is_not_empty",
    "date_on", "date_before", "date_after", "date_between",
]

DEFAULT_OPERATOR: FilterOperator = "contains"
VALUE_FREE_OPERATORS: frozenset[str] = frozenset({"is_empty", "is_not_empty"})
DATE_OPERATORS: frozenset[str] = frozenset({"date_on", "date_before", "date_after", "date_between"})
DATE_RANGE_OPERATORS: frozenset[str] = frozenset({"date_between"})
VALID_OPERATORS: frozenset[str] = frozenset({
    "contains", "equals", "fuzzy",
    "is_empty", "is_not_empty",
    "date_on", "date_before", "date_after", "date_between",
})

_FUZZY_THRESHOLD = 0.3


@dataclass(frozen=True)
class FilterEntry:
    value: str
    operator: FilterOperator
    value_end: str | None = None  # second bound for date_between


@dataclass(frozen=True)
class FilterableField:
    contains_expr: str | None = None
    col_expr: str | None = None
    empty_expr: str | None = None


# Each builder returns (sql_fragment, []) — bind values are appended by the caller.
OperatorBuilder = Callable[[str, int], tuple[str, list[Any]]]


def _build_equals(col_expr: str, idx: int) -> tuple[str, list[Any]]:
    return f"{col_expr} = ${idx}", []


def _build_fuzzy(col_expr: str, idx: int) -> tuple[str, list[Any]]:
    return f"similarity({col_expr}, ${idx}) > {_FUZZY_THRESHOLD}", []


def _build_date_on(col_expr: str, idx: int) -> tuple[str, list[Any]]:
    return f"DATE({col_expr}) = ${idx}", []


def _build_date_before(col_expr: str, idx: int) -> tuple[str, list[Any]]:
    return f"DATE({col_expr}) < ${idx}", []


def _build_date_after(col_expr: str, idx: int) -> tuple[str, list[Any]]:
    return f"DATE({col_expr}) > ${idx}", []


def _build_date_between(col_expr: str, idx: int) -> tuple[str, list[Any]]:
    return f"DATE({col_expr}) BETWEEN ${idx} AND ${idx + 1}", []


OPERATOR_BUILDERS: dict[str, OperatorBuilder] = {
    "equals":       _build_equals,
    "fuzzy":        _build_fuzzy,
    "date_on":      _build_date_on,
    "date_before":  _build_date_before,
    "date_after":   _build_date_after,
    "date_between": _build_date_between,
}


def build_value_free_sql(field_def: FilterableField, operator: str) -> str | None:
    """Return SQL fragment for is_empty/is_not_empty, using empty_expr override when set."""
    if operator == "is_empty":
        if field_def.empty_expr:
            return field_def.empty_expr
        if field_def.col_expr:
            return f"({field_def.col_expr} IS NULL OR {field_def.col_expr} = '')"
        return None
    # is_not_empty
    if field_def.empty_expr:
        return f"NOT ({field_def.empty_expr})"
    if field_def.col_expr:
        return f"({field_def.col_expr} IS NOT NULL AND {field_def.col_expr} <> '')"
    return None
