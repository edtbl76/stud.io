"""Scanner pattern rules — create/delete/toggle/acknowledge routes + counts + alias persistence.

The pure evaluation engine (compile/resolve, U-13) lives in `scanner_pattern_eval`; this module
owns the routes, count aggregation, and the U-14 alias write path. Counts run through the
resolver (affected = fires, clean = resolves to exactly one qualifying parent).
"""
from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_conn
from routers.auth import UserOut, require_admin
from routers.scanner_actions import append_disk_path
from routers.scanner_catalog import build_matching_context, load_plugin_format_ids
from routers.scanner_pattern_eval import (
    Resolution,
    _Eval,
    _eval_for,
    compile_pattern,
    resolve_variant,
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


# ---------------------------------------------------------------------------
# Counts (run through the resolver — affected = fires, clean = resolves)
# ---------------------------------------------------------------------------

async def _active_candidates(conn: Connection):
    return await conn.fetch(
        "SELECT result_id, name, vendor, version, format, path FROM plugin_scan_results "
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
# Alias persistence (U-14) — write a Resolution as a name alias + append disk_paths
# ---------------------------------------------------------------------------

async def _write_alias(conn: Connection, res: Resolution, username: str) -> None:
    """Persist a resolved variant as a name alias. Idempotent on disk_name (first write wins)."""
    await conn.execute(
        "INSERT INTO scanner_name_aliases (disk_name, catalog_record_id, catalog_table, created_by) "
        "VALUES ($1, $2::uuid, $3, $4) ON CONFLICT (disk_name) DO NOTHING",
        res.disk_name, res.catalog_record_id, res.catalog_table, username,
    )


async def _append_variant_path(
    conn: Connection, res: Resolution, row: Mapping[str, object], username: str,
) -> None:
    """Append the resolved variant's install to its parent catalog record's disk_paths."""
    entry = {"path": row["path"], "format": row["format"], "version": row["version"]}
    await append_disk_path(conn, (res.catalog_table, UUID(res.catalog_record_id)), entry, username)


async def _persist_resolutions(
    conn: Connection, resolutions: list[tuple[Mapping[str, object], Resolution]], username: str,
) -> AcknowledgeCleanResult:
    """Write aliases + append disk_paths + confirm the resolving rows, atomically."""
    async with conn.transaction():
        for row, res in resolutions:
            await _write_alias(conn, res, username)
            await _append_variant_path(conn, res, row, username)
        return await _bulk_confirm(conn, [row["result_id"] for row, _ in resolutions], username)


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
    resolutions = [(r, res) for r in rows if (res := resolve_variant(r, ev)) is not None]
    return await _persist_resolutions(conn, resolutions, user.username)


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
