"""Property-based test for compile_pattern round-trip (U-12).

Invariant: for a template '{name}' + suffix, matching against (name + suffix) extracts
exactly `name`. The non-greedy group plus the `$` anchor make `name` the unique prefix
whose remainder equals the (escaped) suffix.
"""
from hypothesis import given, settings
from hypothesis import strategies as st

from routers.scanner_pattern_rules import compile_pattern

# Letters/digits only: no regex-special chars and no '{'/'}' that could form a placeholder.
_safe = st.text(st.characters(whitelist_categories=("Ll", "Lu", "Nd")), min_size=1, max_size=20)


@settings(max_examples=200)
@given(name=_safe, suffix=_safe)
def test_compile_pattern_roundtrip(name: str, suffix: str) -> None:
    matched = compile_pattern("{name}" + suffix).match(name + suffix)
    assert matched is not None
    assert matched.group("name") == name
