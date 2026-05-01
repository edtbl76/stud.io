"""Property-based tests for the plugin scanner matching logic.

All invariants tested on the pure match_plugin function — no I/O.
"""
from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st

from routers.scanner_match import (
    CatalogRecord, match_plugin,
)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

_text = st.text(min_size=1, max_size=40, alphabet=st.characters(whitelist_categories=("L", "N", "Zs")))

_record_st = st.builds(
    CatalogRecord,
    record_id=st.uuids().map(str),
    record_table=st.sampled_from(["effects", "instruments"]),
    name=_text,
    vendor=st.one_of(st.none(), _text),
    version=st.one_of(st.none(), _text),
    search_key=_text.map(lambda s: s.lower().strip()),
)


# ---------------------------------------------------------------------------
# Invariant 1: score bounds
# ---------------------------------------------------------------------------

@given(name=_text, vendor=_text, index=st.lists(_record_st, max_size=10))
@settings(max_examples=100)
def test_match_score_between_0_and_100(name, vendor, index):
    _, result = match_plugin(name, vendor, index, set())
    if result.score is not None:
        assert 0.0 <= result.score <= 100.0


# ---------------------------------------------------------------------------
# Invariant 2: confidence level is always a valid value
# ---------------------------------------------------------------------------

VALID_CONFIDENCES = {"exact", "high", "medium", "low", "none"}


@given(name=_text, vendor=_text, index=st.lists(_record_st, max_size=10))
@settings(max_examples=100)
def test_match_confidence_is_valid(name, vendor, index):
    _, result = match_plugin(name, vendor, index, set())
    assert result.confidence in VALID_CONFIDENCES


# ---------------------------------------------------------------------------
# Invariant 3: exact match has no score, all others do (or none for no-match)
# ---------------------------------------------------------------------------

@given(name=_text, vendor=_text, index=st.lists(_record_st, max_size=10))
@settings(max_examples=100)
def test_exact_match_has_no_score(name, vendor, index):
    _, result = match_plugin(name, vendor, index, set())
    if result.confidence == "exact":
        assert result.score is None
    if result.confidence == "none":
        assert result.score is None
    if result.confidence in ("high", "medium", "low"):
        assert result.score is not None


# ---------------------------------------------------------------------------
# Invariant 4: exclusion list always returns no-match
# ---------------------------------------------------------------------------

@given(name=_text, vendor=_text, index=st.lists(_record_st, max_size=10))
@settings(max_examples=100)
def test_excluded_plugin_always_returns_none(name, vendor, index):
    fingerprint = f"{vendor} {name}".lower().strip()
    _, result = match_plugin(name, vendor, index, {fingerprint})
    assert result.confidence == "none"
    assert result.record is None


# ---------------------------------------------------------------------------
# Invariant 5: determinism — same inputs produce same outputs
# ---------------------------------------------------------------------------

@given(name=_text, vendor=_text, index=st.lists(_record_st, max_size=10))
@settings(max_examples=100)
def test_match_is_deterministic(name, vendor, index):
    fp1, r1 = match_plugin(name, vendor, index, set())
    fp2, r2 = match_plugin(name, vendor, index, set())
    assert fp1 == fp2
    assert r1.confidence == r2.confidence
    assert r1.score == r2.score
