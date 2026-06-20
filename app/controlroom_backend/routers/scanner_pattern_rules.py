"""Scanner pattern rules — create/delete/toggle/acknowledge + counts (U-12).

Counts are read-only (D-4): the pattern fires (regex extracts {name}) and the
aliased name is scored with the shared match/clean machinery on name+vendor+version
(decision A — `format` in match_fields is a no-op for counting; real format-honoring
and persistence are U-13/U-14). `match_fields` is persisted for U-13 but does not alter
the U-12 count beyond validation.
"""
from __future__ import annotations

import re
from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_conn
from routers.auth import UserOut, require_admin
from routers.scanner_catalog import build_matching_context, is_clean_match
from routers.scanner_match import match_plugin
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


# ---------------------------------------------------------------------------
# Pattern fire + read-only counting
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


async def _active_candidates(conn: Connection):
    return await conn.fetch(
        "SELECT result_id, name, vendor, version FROM plugin_scan_results "
        "WHERE confirmed_at IS NULL AND status NOT IN ('excluded','ignored')"
    )


def _score(row, compiled: re.Pattern, ctx) -> tuple[int, int]:
    """(affected, clean) for one candidate: the pattern fires and the aliased name
    resolves; clean = exact name+vendor+version match (decision A)."""
    matched = compiled.match(row["name"] or "")
    if not matched:
        return 0, 0
    aliased_name = matched.group("name")
    _, match = match_plugin(aliased_name, row["vendor"], ctx.catalog_index, ctx.exclusions)
    if match.record is None:
        return 0, 0
    return 1, int(is_clean_match(aliased_name, row["vendor"], row["version"], match.record))


def _split(rows, compiled: re.Pattern, ctx) -> dict[str, int]:
    affected = clean = 0
    for row in rows:
        a, c = _score(row, compiled, ctx)
        affected += a
        clean += c
    return {"affected_count": affected, "clean_count": clean, "needs_review_count": affected - clean}


async def count_pattern(conn: Connection, pattern: str) -> dict[str, int]:
    ctx = await build_matching_context(conn)
    rows = await _active_candidates(conn)
    return _split(rows, compile_pattern(pattern), ctx)


async def count_patterns(conn: Connection, pattern_rows) -> dict:
    """Counts for many patterns, sharing one matching context + candidate fetch (list view)."""
    ctx = await build_matching_context(conn)
    rows = await _active_candidates(conn)
    return {r["rule_id"]: _split(rows, compile_pattern(r["pattern"]), ctx) for r in pattern_rows}


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
    counts = await count_pattern(conn, body.pattern)
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
    rule = await conn.fetchrow("SELECT pattern FROM scanner_name_patterns WHERE rule_id=$1", rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail=_PATTERN_NOT_FOUND)
    compiled = compile_pattern(rule["pattern"])
    ctx = await build_matching_context(conn, fingerprints=[])
    rows = await _active_candidates(conn)
    clean_ids = [r["result_id"] for r in rows if _score(r, compiled, ctx) == (1, 1)]
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
