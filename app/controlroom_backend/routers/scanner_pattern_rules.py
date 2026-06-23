"""Scanner pattern rules — create/delete/toggle/acknowledge + counts + evaluation.

The resolver (U-13) honors `match_fields` exactly: the pattern fires (regex extracts
`{name}`), and a parent catalog record qualifies iff `name == {name}` and every field listed
in `match_fields` (vendor/version/format) matches — format crossing the scan-string ↔ catalog-id
boundary via the `plugin_formats` lookup. Resolution is **pure** (no persistence — that is U-14);
counts run through the same resolver (affected = fires, clean = resolves to one qualifying parent).
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_conn
from routers.auth import UserOut, require_admin
from routers.scanner_catalog import (
    MatchingContext,
    build_matching_context,
    load_plugin_format_ids,
)
from routers.scanner_rule_counts import _bulk_confirm
from schemas.scanner_rules import (
    AcknowledgeCleanResult,
    PatternRuleIn,
    PatternRuleOut,
    RuleToggleRequest,
)

router = APIRouter()

_PATTERN_NOT_FOUND = "Pattern rule not found"
_ALLOWED_MATCH_FIELDS = {"vendor", "version", "format"}
_PATTERN_COLS = (
    "rule_id, label, pattern, match_fields, action, enabled, is_seeded, created_by, created_at"
)
_ZERO_COUNTS = {"affected_count": 0, "clean_count": 0, "needs_review_count": 0}


@dataclass(frozen=True)
class Resolution:
    disk_name: str
    catalog_record_id: str
    catalog_table: str


# ---------------------------------------------------------------------------
# Pattern compilation + match_fields-driven resolution (U-13)
# ---------------------------------------------------------------------------

def compile_pattern(pattern: str) -> re.Pattern:
    """Compile a template like '{name}(m)' into a regex with a 'name' capture group."""
    regex = "(?P<name>.+?)".join(re.escape(part) for part in pattern.split("{name}"))
    return re.compile(f"^{regex}$")


def _validation_error(body: PatternRuleIn) -> str | None:
    """Return the first validation error message, or None if the pattern is valid."""
    if "{name}" not in body.pattern:
        return "Pattern must contain {name}"
    try:
        compile_pattern(body.pattern)
    except re.error as exc:
        return f"Invalid pattern regex: {exc}"
    if not body.match_fields or not set(body.match_fields) <= _ALLOWED_MATCH_FIELDS:
        return f"match_fields must be a non-empty subset of {sorted(_ALLOWED_MATCH_FIELDS)}"
    return None


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


# ---------------------------------------------------------------------------
# Counts (run through the resolver — affected = fires, clean = resolves)
# ---------------------------------------------------------------------------

async def _active_candidates(conn: Connection):
    return await conn.fetch(
        "SELECT result_id, name, vendor, version, format FROM plugin_scan_results "
        "WHERE confirmed_at IS NULL AND status NOT IN ('excluded','ignored')"
    )


def _score(row, ev: _Eval) -> tuple[int, int]:
    if ev.compiled.match(row["name"] or "") is None:
        return 0, 0
    return 1, int(resolve_variant(row, ev) is not None)


def _split(rows, ev: _Eval) -> dict[str, int]:
    affected = clean = 0
    for row in rows:
        a, c = _score(row, ev)
        affected += a
        clean += c
    return {"affected_count": affected, "clean_count": clean, "needs_review_count": affected - clean}


async def count_pattern(conn: Connection, pattern: str, match_fields: Iterable[str]) -> dict[str, int]:
    ctx = await build_matching_context(conn)
    format_ids = await load_plugin_format_ids(conn)
    rows = await _active_candidates(conn)
    return _split(rows, _eval_for(pattern, match_fields, ctx, format_ids))


async def count_patterns(
    conn: Connection, pattern_rows: Iterable[Mapping[str, object]],
) -> dict[UUID, dict[str, int]]:
    """Counts for many patterns, sharing one matching context + candidate fetch (list view)."""
    ctx = await build_matching_context(conn)
    format_ids = await load_plugin_format_ids(conn)
    rows = await _active_candidates(conn)
    return {
        r["rule_id"]: _split(rows, _eval_for(r["pattern"], r["match_fields"], ctx, format_ids))
        for r in pattern_rows
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/rules/pattern", status_code=status.HTTP_201_CREATED,
             responses={422: {"description": "Invalid pattern or match_fields"}})
async def create_pattern_rule(
    body: PatternRuleIn,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> PatternRuleOut:
    error = _validation_error(body)
    if error:
        raise HTTPException(status_code=422, detail=error)
    row = await conn.fetchrow(
        f"INSERT INTO scanner_name_patterns "  # noqa: S608 — columns are constants; values parameterized
        f"(label, pattern, match_fields, action, enabled, is_seeded, created_by) "
        f"VALUES ($1,$2,$3,$4,TRUE,FALSE,$5) RETURNING {_PATTERN_COLS}",
        body.label, body.pattern, body.match_fields, body.action, user.username,
    )
    counts = await count_pattern(conn, body.pattern, body.match_fields)
    return PatternRuleOut(**dict(row), **counts)


@router.delete("/rules/pattern/{rule_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses={403: {"description": "Seeded pattern rules cannot be deleted"},
                          404: {"description": _PATTERN_NOT_FOUND}})
async def delete_pattern_rule(
    rule_id: UUID,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> None:
    row = await conn.fetchrow("SELECT is_seeded FROM scanner_name_patterns WHERE rule_id=$1", rule_id)
    if not row:
        raise HTTPException(status_code=404, detail=_PATTERN_NOT_FOUND)
    if row["is_seeded"]:
        raise HTTPException(status_code=403, detail="Seeded pattern rules cannot be deleted")
    await conn.execute("DELETE FROM scanner_name_patterns WHERE rule_id=$1", rule_id)


@router.post("/rules/pattern/{rule_id}/acknowledge-clean",
             responses={404: {"description": _PATTERN_NOT_FOUND}})
async def acknowledge_clean_pattern(
    rule_id: UUID,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> AcknowledgeCleanResult:
    rule = await conn.fetchrow("SELECT pattern, match_fields FROM scanner_name_patterns WHERE rule_id=$1", rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail=_PATTERN_NOT_FOUND)
    ctx = await build_matching_context(conn, fingerprints=[])
    format_ids = await load_plugin_format_ids(conn)
    ev = _eval_for(rule["pattern"], rule["match_fields"], ctx, format_ids)
    rows = await _active_candidates(conn)
    clean_ids = [r["result_id"] for r in rows if resolve_variant(r, ev) is not None]
    return await _bulk_confirm(conn, clean_ids, user.username)


@router.patch("/rules/pattern/{rule_id}/toggle", responses={404: {"description": _PATTERN_NOT_FOUND}})
async def toggle_pattern_rule(
    rule_id: UUID,
    body: RuleToggleRequest,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> PatternRuleOut:
    row = await conn.fetchrow(
        f"UPDATE scanner_name_patterns SET enabled=$1 WHERE rule_id=$2 RETURNING {_PATTERN_COLS}",  # noqa: S608
        body.enabled, rule_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=_PATTERN_NOT_FOUND)
    return PatternRuleOut(**dict(row), **_ZERO_COUNTS)
