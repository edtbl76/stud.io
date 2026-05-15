"""Property-based tests for PluginPathEntry schema validation.

Tests pure Pydantic validation — no I/O.
"""
from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError
import pytest

from schemas.common import PluginPathEntry

_VALID_FORMATS = ["vst3", "au", "vst2"]

_valid_entry_st = st.builds(
    dict,
    path=st.text(min_size=1, max_size=200),
    format=st.sampled_from(_VALID_FORMATS),
    version=st.text(min_size=0, max_size=50),
)

_invalid_format_st = st.text(min_size=1, max_size=20).filter(
    lambda s: s not in _VALID_FORMATS
)


@given(entry=_valid_entry_st)
@settings(max_examples=200)
def test_valid_plugin_path_entry_always_parses(entry):
    parsed = PluginPathEntry(**entry)
    assert parsed.path == entry["path"]
    assert parsed.format == entry["format"]
    assert parsed.version == entry["version"]


@given(
    path=st.text(min_size=1, max_size=200),
    bad_format=_invalid_format_st,
    version=st.text(min_size=0, max_size=50),
)
@settings(max_examples=200)
def test_invalid_format_always_raises(path, bad_format, version):
    with pytest.raises(ValidationError):
        PluginPathEntry(path=path, format=bad_format, version=version)


@given(entries=st.lists(_valid_entry_st, min_size=0, max_size=10))
@settings(max_examples=100)
def test_list_of_valid_entries_round_trips(entries):
    parsed = [PluginPathEntry(**e) for e in entries]
    serialized = [p.model_dump() for p in parsed]
    re_parsed = [PluginPathEntry(**s) for s in serialized]
    assert all(
        a.path == b.path and a.format == b.format and a.version == b.version
        for a, b in zip(parsed, re_parsed)
    )


def test_empty_list_is_valid():
    entries: list[PluginPathEntry] = []
    assert entries == []
