"""Property-based test for the U-13 resolver: any Resolution honors match_fields.

This re-derives the contract independently (direct field comparison), rather than via
`_honors_match_fields`, so it actually exercises `resolve_variant`'s behavior rather than
restating its implementation.
"""
from types import SimpleNamespace

from hypothesis import given, settings
from hypothesis import strategies as st

from routers.scanner_catalog import CatalogRecord
from routers.scanner_pattern_eval import _Eval, compile_pattern, resolve_variant

_word = st.text(st.characters(whitelist_categories=("Ll", "Lu", "Nd")), min_size=1, max_size=6)
_match_fields = st.sets(st.sampled_from(["vendor", "version", "format"]))
_fmt_id = st.sampled_from(["F1", "F2", "F3", "FX"])


@st.composite
def _parents(draw):
    out = []
    for i in range(draw(st.integers(min_value=0, max_value=4))):
        out.append(CatalogRecord(
            record_id=f"c{i}", record_table="effects",
            name=draw(_word), vendor=draw(_word), version=draw(_word),
            disk_paths=[], plugin_format_ids=draw(st.lists(st.sampled_from(["F1", "F2", "F3"]), unique=True)),
            search_key="",
        ))
    return out


@st.composite
def _scenarios(draw):
    """One drawn scenario, bundled so the property takes a single argument."""
    return SimpleNamespace(
        suffix=draw(_word), base=draw(_word), vendor=draw(_word), version=draw(_word),
        fmt=draw(st.sampled_from(["vst3", "au"])), match_fields=draw(_match_fields),
        parents=draw(_parents()), fmt_id=draw(_fmt_id),
    )


@settings(max_examples=300)
@given(s=_scenarios())
def test_resolution_honors_match_fields(s) -> None:
    ev = _Eval(compile_pattern("{name}" + s.suffix), frozenset(s.match_fields), s.parents, {s.fmt: s.fmt_id})
    row = {"name": s.base + s.suffix, "vendor": s.vendor, "version": s.version, "format": s.fmt}

    res = resolve_variant(row, ev)
    if res is None:
        return
    parent = next((p for p in s.parents if p.record_id == res.catalog_record_id), None)
    assert parent is not None
    extracted = ev.compiled.match(row["name"]).group("name")
    # Independent re-check of the contract the resolver promises.
    assert parent.name.lower() == extracted.lower()
    if "vendor" in s.match_fields:
        assert (parent.vendor or "").lower() == s.vendor.lower()
    if "version" in s.match_fields:
        assert (parent.version or "") == s.version
    if "format" in s.match_fields:
        assert ev.format_ids.get(s.fmt.lower()) in parent.plugin_format_ids
