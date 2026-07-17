"""Shared rule engine — config, generic CRUD, and affected/clean/needs_review counting.

Used by all scanner rule types (vendor/name in scanner_rules.py, pattern in
scanner_pattern_rules.py). Imports nothing from sibling rule routers (acyclic).
"""
from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from asyncpg import Connection
from asyncpg.exceptions import UniqueViolationError
from fastapi import HTTPException

from routers.scanner_catalog import MatchingContext, build_matching_context, is_clean_match
from routers.scanner_match import match_plugin
from schemas.scanner_rules import AcknowledgeCleanResult


@dataclass(frozen=True)
class _RuleConfig:
    disk_col: str
    catalog_col: str
    scan_col: str
    other_scan_col: str
    not_found: str
    conflict_msg: str
    insert_sql: str
    update_sql: str
    delete_sql: str
    toggle_sql: str
    ack_fetch_sql: str
    ack_scan_sql: str


@dataclass(frozen=True)
class _RuleApp:
    rule_type: str
    catalog_value: str


@dataclass(frozen=True)
class _RuleValues:
    disk: str
    catalog: str


# ---------------------------------------------------------------------------
# Generic CRUD helpers (cfg-driven; shared by vendor/name)
# ---------------------------------------------------------------------------

async def _insert_rule(conn: Connection, cfg: _RuleConfig, vals: _RuleValues, username: str):
    try:
        return await conn.fetchrow(cfg.insert_sql, vals.disk.lower(), vals.catalog, username)
    except UniqueViolationError as exc:
        raise HTTPException(status_code=409, detail=cfg.conflict_msg) from exc


async def _update_rule(conn: Connection, cfg: _RuleConfig, rule_id: UUID, catalog_value: str):
    row = await conn.fetchrow(cfg.update_sql, catalog_value, rule_id)
    if not row:
        raise HTTPException(status_code=404, detail=cfg.not_found)
    return row


async def _delete_rule(conn: Connection, cfg: _RuleConfig, rule_id: UUID) -> None:
    if await conn.execute(cfg.delete_sql, rule_id) == "DELETE 0":
        raise HTTPException(status_code=404, detail=cfg.not_found)


async def _toggle_rule(conn: Connection, cfg: _RuleConfig, rule_id: UUID, enabled: bool):
    row = await conn.fetchrow(cfg.toggle_sql, enabled, rule_id)
    if not row:
        raise HTTPException(status_code=404, detail=cfg.not_found)
    return row


# ---------------------------------------------------------------------------
# Counting + clean acknowledgement (shared by all rule types)
# ---------------------------------------------------------------------------

def _collect_clean_ids(rows, cfg: _RuleConfig, catalog_value: str, ctx: MatchingContext) -> list:
    clean_ids = []
    for row in rows:
        is_vendor = cfg.scan_col == "vendor"
        display_vendor = catalog_value if is_vendor else row[cfg.other_scan_col]
        display_name = row[cfg.other_scan_col] if is_vendor else catalog_value
        _, match = match_plugin(display_name, display_vendor, ctx.catalog_index, ctx.exclusions)
        if match.record is None:
            continue
        if is_clean_match(display_name, display_vendor, row["version"], match.record):
            clean_ids.append(row["result_id"])
    return clean_ids


async def _bulk_confirm(conn: Connection, clean_ids: list, username: str) -> AcknowledgeCleanResult:
    if not clean_ids:
        return AcknowledgeCleanResult(acknowledged=0)
    result = await conn.execute(
        "UPDATE plugin_scan_results SET confirmed_at=NOW(), confirmed_by=$1 "
        "WHERE result_id = ANY($2::uuid[]) AND confirmed_at IS NULL",
        username, clean_ids,
    )
    return AcknowledgeCleanResult(acknowledged=int(result.split()[-1]))


async def _ack_clean(conn: Connection, cfg: _RuleConfig, rule_id: UUID, username: str) -> AcknowledgeCleanResult:
    rule = await conn.fetchrow(cfg.ack_fetch_sql, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail=cfg.not_found)
    # fingerprints=[] preserves the original empty rejection set (acknowledge
    # ignores rejections), taking the no-query short-circuit.
    ctx = await build_matching_context(conn, fingerprints=[])
    rows = await conn.fetch(cfg.ack_scan_sql, rule[cfg.disk_col])
    clean_ids = _collect_clean_ids(rows, cfg, rule[cfg.catalog_col], ctx)
    return await _bulk_confirm(conn, clean_ids, username)


async def _fetch_candidates(conn: Connection, rule_type: str, disk_field: str):
    if rule_type == "vendor":
        return await conn.fetch(
            "SELECT result_id, name, vendor, version FROM plugin_scan_results "
            "WHERE lower(vendor)=$1 AND confirmed_at IS NULL AND status != 'excluded'",
            disk_field.lower(),
        )
    return await conn.fetch(
        "SELECT result_id, name, vendor, version FROM plugin_scan_results "
        "WHERE lower(name)=$1 AND confirmed_at IS NULL AND status != 'excluded'",
        disk_field.lower(),
    )


def _score_row(row, rule_app: _RuleApp, ctx: MatchingContext) -> tuple[int, int]:
    display_vendor = rule_app.catalog_value if rule_app.rule_type == "vendor" else row["vendor"]
    display_name = rule_app.catalog_value if rule_app.rule_type == "name" else row["name"]
    _, match = match_plugin(display_name, display_vendor, ctx.catalog_index, ctx.exclusions)
    if match.record is None:
        return 0, 0
    fp = f"{display_vendor} {display_name}".lower().strip()
    if (fp, str(match.record.record_id)) in ctx.rejection_set:
        return 0, 0
    return 1, int(is_clean_match(display_name, display_vendor, row["version"], match.record))


async def count_affected_with_clean_split(
    conn: Connection, *, rule_type: str, disk_field: str, catalog_value: str,
) -> dict[str, int]:
    ctx = await build_matching_context(conn)
    rule_app = _RuleApp(rule_type=rule_type, catalog_value=catalog_value)
    rows = await _fetch_candidates(conn, rule_type, disk_field)
    affected, clean = 0, 0
    for row in rows:
        a, c = _score_row(row, rule_app, ctx)
        affected += a
        clean += c
    return {"affected_count": affected, "clean_count": clean, "needs_review_count": affected - clean}


async def _count_rules(conn: Connection, rules: list, rule_type: str, ctx: MatchingContext) -> dict:
    disk_col = "disk_vendor" if rule_type == "vendor" else "disk_name"
    cat_col = "catalog_vendor" if rule_type == "vendor" else "catalog_name"
    counts: dict = {}
    for rule in rules:
        rule_app = _RuleApp(rule_type=rule_type, catalog_value=rule[cat_col])
        rows = await _fetch_candidates(conn, rule_type, rule[disk_col])
        affected, clean = 0, 0
        for row in rows:
            a, c = _score_row(row, rule_app, ctx)
            affected += a
            clean += c
        counts[rule["rule_id"]] = {
            "affected_count": affected, "clean_count": clean, "needs_review_count": affected - clean,
        }
    return counts
