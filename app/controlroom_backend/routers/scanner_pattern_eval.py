"""Scanner pattern evaluation engine (U-13) — pure, no persistence, no FastAPI.

The resolver honors `match_fields` exactly: the pattern fires (regex extracts `{name}`),
and a parent catalog record qualifies iff `name == {name}` and every field listed in
`match_fields` (vendor/version/format) matches — format crossing the scan-string ↔ catalog-id
boundary via the `plugin_formats` lookup. Counts (U-12) and the U-14 alias write path both run
through `resolve_variant` (affected = fires, clean = resolves to exactly one qualifying parent).
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from routers.scanner_catalog import MatchingContext


@dataclass(frozen=True)
class Resolution:
    disk_name: str
    catalog_record_id: str
    catalog_table: str


def compile_pattern(pattern: str) -> re.Pattern:
    """Compile a template like '{name}(m)' into a regex with a 'name' capture group."""
    regex = "(?P<name>.+?)".join(re.escape(part) for part in pattern.split("{name}"))
    return re.compile(f"^{regex}$")


def _norm(value: str | None) -> str:
    return (value or "").lower()


def _format_matches(scan_format: str | None, parent_format_ids: list[str], format_ids: dict[str, str]) -> bool:
    type_id = format_ids.get(_norm(scan_format))
    return type_id is not None and type_id in parent_format_ids


@dataclass(frozen=True)
class _Eval:
    """Per-pattern evaluation context: compiled regex + the inputs resolution needs."""
    compiled: re.Pattern
    match_fields: frozenset[str]
    catalog_index: list
    format_ids: dict[str, str]


def _honors_match_fields(row, parent, extracted: str, ev: _Eval) -> bool:
    """Parent qualifies iff name == {name} and exactly the listed match_fields match."""
    if _norm(parent.name) != _norm(extracted):
        return False
    checks = {
        "vendor": lambda: _norm(parent.vendor) == _norm(row["vendor"]),
        "version": lambda: (parent.version or "") == (row["version"] or ""),
        "format": lambda: _format_matches(row["format"], parent.plugin_format_ids, ev.format_ids),
    }
    return all(checks[field]() for field in ev.match_fields)


def resolve_variant(row: Mapping[str, object], ev: _Eval) -> Resolution | None:
    """Resolve a scan row's variant name to its single qualifying parent, or None (no fire / no / ambiguous parent)."""
    matched = ev.compiled.match(row["name"] or "")
    if not matched:
        return None
    extracted = matched.group("name")
    qualifying = [rec for rec in ev.catalog_index if _honors_match_fields(row, rec, extracted, ev)]
    if len(qualifying) != 1:
        return None
    rec = qualifying[0]
    return Resolution(disk_name=row["name"], catalog_record_id=rec.record_id, catalog_table=rec.record_table)


def _eval_for(pattern: str, match_fields, ctx, format_ids: dict[str, str]) -> _Eval:
    return _Eval(compile_pattern(pattern), frozenset(match_fields), ctx.catalog_index, format_ids)


def resolve_variants(
    scan_rows: Iterable[Mapping[str, object]],
    enabled_patterns: Iterable[Mapping[str, object]],
    ctx: MatchingContext,
    format_ids: dict[str, str],
) -> list[Resolution]:
    """Pure engine entry: every (enabled pattern x scan row) that resolves. U-14 persists/wires."""
    out: list[Resolution] = []
    for p in enabled_patterns:
        ev = _eval_for(p["pattern"], p["match_fields"], ctx, format_ids)
        out.extend(res for row in scan_rows if (res := resolve_variant(row, ev)) is not None)
    return out
