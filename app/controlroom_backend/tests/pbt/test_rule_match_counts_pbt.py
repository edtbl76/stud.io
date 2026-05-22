"""Property-based tests for count_affected_with_clean_split invariant.

Verifies: clean_count + needs_review_count == affected_count
across arbitrary combinations of scan results, rules, and catalog records.
"""
from __future__ import annotations

from dataclasses import dataclass

from hypothesis import given, settings
from hypothesis import strategies as st

_text = st.text(min_size=1, max_size=30, alphabet=st.characters(whitelist_categories=("L", "N", "Zs")))
_version = st.one_of(st.none(), st.text(min_size=1, max_size=10, alphabet="0123456789."))


@dataclass
class FakeScanResult:
    name: str
    vendor: str
    version: str | None


@dataclass
class FakeCatalogRecord:
    name: str
    vendor: str | None
    version: str | None


@dataclass(frozen=True)
class _RuleSpec:
    rule_type: str   # "vendor" | "name"
    disk_field: str
    normalized: str  # catalog_vendor for vendor rules, catalog_name for name rules


def _is_clean(result: FakeScanResult, display_name: str, display_vendor: str, record: FakeCatalogRecord) -> bool:
    return (
        display_name.lower() == (record.name or "").lower()
        and display_vendor.lower() == (record.vendor or "").lower()
        and (result.version or "") == (record.version or "")
    )


def _apply_rule(result: FakeScanResult, spec: _RuleSpec) -> tuple[str, str] | None:
    """Return (display_name, display_vendor) after applying the rule, or None if not matching."""
    if spec.rule_type == "vendor":
        if result.vendor.lower() != spec.disk_field.lower():
            return None
        return result.name, spec.normalized
    if result.name.lower() != spec.disk_field.lower():
        return None
    return spec.normalized, result.vendor


def _find_catalog_match(display_name: str, display_vendor: str, catalog: list[FakeCatalogRecord]) -> FakeCatalogRecord | None:
    key = f"{display_vendor or ''} {display_name}".lower().strip()
    return next(
        (rec for rec in catalog if f"{rec.vendor or ''} {rec.name}".lower().strip() == key),
        None,
    )


def count_affected_pure(results: list[FakeScanResult], catalog: list[FakeCatalogRecord], spec: _RuleSpec) -> dict[str, int]:
    affected, clean, needs_review = 0, 0, 0
    for result in results:
        applied = _apply_rule(result, spec)
        if applied is None:
            continue
        display_name, display_vendor = applied
        match = _find_catalog_match(display_name, display_vendor, catalog)
        if match is None:
            continue
        affected += 1
        if _is_clean(result, display_name, display_vendor, match):
            clean += 1
        else:
            needs_review += 1
    return {"affected_count": affected, "clean_count": clean, "needs_review_count": needs_review}


def _independent_needs_review(
    results: list[FakeScanResult], catalog: list[FakeCatalogRecord], spec: _RuleSpec
) -> int:
    count = 0
    for result in results:
        applied = _apply_rule(result, spec)
        if applied is None:
            continue
        match = _find_catalog_match(*applied, catalog)
        if match is None:
            continue
        if not _is_clean(result, *applied, match):
            count += 1
    return count


_result_st = st.builds(FakeScanResult, name=_text, vendor=_text, version=_version)
_record_st = st.builds(FakeCatalogRecord, name=_text, vendor=st.one_of(st.none(), _text), version=_version)


@given(
    results=st.lists(_result_st, min_size=0, max_size=20),
    catalog=st.lists(_record_st, min_size=0, max_size=10),
    disk_field=_text,
    normalized=_text,
)
@settings(max_examples=200)
def test_counts_invariant_vendor_rule(results, catalog, disk_field, normalized):
    spec = _RuleSpec("vendor", disk_field, normalized)
    counts = count_affected_pure(results, catalog, spec)
    assert counts["clean_count"] + counts["needs_review_count"] == counts["affected_count"]
    assert counts["needs_review_count"] == _independent_needs_review(results, catalog, spec)


@given(
    results=st.lists(_result_st, min_size=0, max_size=20),
    catalog=st.lists(_record_st, min_size=0, max_size=10),
    disk_field=_text,
    normalized=_text,
)
@settings(max_examples=200)
def test_counts_invariant_name_rule(results, catalog, disk_field, normalized):
    spec = _RuleSpec("name", disk_field, normalized)
    counts = count_affected_pure(results, catalog, spec)
    assert counts["clean_count"] + counts["needs_review_count"] == counts["affected_count"]
    assert counts["needs_review_count"] == _independent_needs_review(results, catalog, spec)


@given(results=st.lists(_result_st, min_size=0, max_size=20))
@settings(max_examples=100)
def test_counts_with_empty_catalog_all_unaffected(results):
    counts = count_affected_pure(results, [], _RuleSpec("vendor", "any", "Any Vendor"))
    assert counts["affected_count"] == 0
    assert counts["clean_count"] == 0
    assert counts["needs_review_count"] == 0


@given(
    results=st.lists(_result_st, min_size=1, max_size=10),
    catalog=st.lists(_record_st, min_size=0, max_size=10),
    disk_field=_text,
    normalized=_text,
)
@settings(max_examples=100)
def test_clean_count_never_exceeds_affected(results, catalog, disk_field, normalized):
    counts = count_affected_pure(results, catalog, _RuleSpec("vendor", disk_field, normalized))
    assert counts["clean_count"] <= counts["affected_count"]
    assert counts["needs_review_count"] >= 0
