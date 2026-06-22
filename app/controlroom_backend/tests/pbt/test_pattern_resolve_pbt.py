"""Property-based test for the U-13 resolver: any Resolution honors match_fields.

This re-derives the contract independently (direct field comparison), rather than via
`_honors_match_fields`, so it actually exercises `resolve_variant`'s behavior rather than
restating its implementation.
"""
from hypothesis import given, settings
from hypothesis import strategies as st

from routers.scanner_catalog import CatalogRecord
from routers.scanner_pattern_rules import _Eval, compile_pattern, resolve_variant

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


@settings(max_examples=300)
@given(
    suffix=_word, vendor=_word, version=_word, fmt=st.sampled_from(["vst3", "au"]),
    match_fields=_match_fields, parents=_parents(), fmt_id=_fmt_id, base=_word,
)
def test_resolution_honors_match_fields(suffix, vendor, version, fmt, match_fields, parents, fmt_id, base) -> None:
    ev = _Eval(compile_pattern("{name}" + suffix), frozenset(match_fields), parents, {fmt: fmt_id})
    row = {"name": base + suffix, "vendor": vendor, "version": version, "format": fmt}

    res = resolve_variant(row, ev)
    if res is None:
        return
    parent = next(p for p in parents if p.record_id == res.catalog_record_id)
    extracted = ev.compiled.match(row["name"]).group("name")
    # Independent re-check of the contract the resolver promises.
    assert parent.name.lower() == extracted.lower()
    if "vendor" in match_fields:
        assert (parent.vendor or "").lower() == vendor.lower()
    if "version" in match_fields:
        assert (parent.version or "") == version
    if "format" in match_fields:
        assert ev.format_ids.get(fmt.lower()) in parent.plugin_format_ids
