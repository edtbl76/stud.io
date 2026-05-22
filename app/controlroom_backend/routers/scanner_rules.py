"""Scanner rule management — vendor, name, and pattern rules."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from asyncpg.exceptions import UniqueViolationError
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_conn
from routers.auth import UserOut, require_admin
from routers.scanner_match import build_catalog_index, load_exclusions, match_plugin
from schemas.scanner_rules import (
    AcknowledgeCleanResult,
    AllRules,
    NameRuleIn,
    NameRuleOut,
    NameRuleUpdate,
    PatternRuleOut,
    RuleToggleRequest,
    VendorRuleIn,
    VendorRuleOut,
    VendorRuleUpdate,
)

router = APIRouter()

_VENDOR_NOT_FOUND = "Vendor rule not found"
_NAME_NOT_FOUND = "Name rule not found"
_PATTERN_NOT_FOUND = "Pattern rule not found"
_VR = "rule_id, disk_vendor, catalog_vendor, enabled, created_by, created_at"
_NR = "rule_id, disk_name, catalog_name, enabled, created_by, created_at"


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


_VENDOR = _RuleConfig(
    disk_col="disk_vendor", catalog_col="catalog_vendor",
    scan_col="vendor", other_scan_col="name",
    not_found=_VENDOR_NOT_FOUND,
    conflict_msg="Vendor rule for this disk_vendor already exists",
    insert_sql=f"INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) VALUES ($1,$2,$3) RETURNING {_VR}",
    update_sql=f"UPDATE scanner_vendor_rules SET catalog_vendor=$1 WHERE rule_id=$2 RETURNING {_VR}",
    delete_sql="DELETE FROM scanner_vendor_rules WHERE rule_id=$1",
    toggle_sql=f"UPDATE scanner_vendor_rules SET enabled=$1 WHERE rule_id=$2 RETURNING {_VR}",
    ack_fetch_sql="SELECT disk_vendor, catalog_vendor FROM scanner_vendor_rules WHERE rule_id=$1",
    ack_scan_sql="SELECT result_id, name, version FROM plugin_scan_results WHERE lower(vendor)=$1 AND confirmed_at IS NULL",
)

_NAME = _RuleConfig(
    disk_col="disk_name", catalog_col="catalog_name",
    scan_col="name", other_scan_col="vendor",
    not_found=_NAME_NOT_FOUND,
    conflict_msg="Name rule for this disk_name already exists",
    insert_sql=f"INSERT INTO scanner_name_rules (disk_name, catalog_name, created_by) VALUES ($1,$2,$3) RETURNING {_NR}",
    update_sql=f"UPDATE scanner_name_rules SET catalog_name=$1 WHERE rule_id=$2 RETURNING {_NR}",
    delete_sql="DELETE FROM scanner_name_rules WHERE rule_id=$1",
    toggle_sql=f"UPDATE scanner_name_rules SET enabled=$1 WHERE rule_id=$2 RETURNING {_NR}",
    ack_fetch_sql="SELECT disk_name, catalog_name FROM scanner_name_rules WHERE rule_id=$1",
    ack_scan_sql="SELECT result_id, vendor, version FROM plugin_scan_results WHERE lower(name)=$1 AND confirmed_at IS NULL",
)


@dataclass(frozen=True)
class _CatalogCtx:
    catalog_index: object
    exclusions: set
    rejection_set: set


@dataclass(frozen=True)
class _RuleApp:
    rule_type: str
    catalog_value: str


@dataclass(frozen=True)
class _RuleValues:
    disk: str
    catalog: str


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------

async def _insert_rule(conn: Connection, cfg: _RuleConfig, vals: _RuleValues, username: str):
    try:
        return await conn.fetchrow(cfg.insert_sql, vals.disk.lower(), vals.catalog, username)
    except UniqueViolationError:
        raise HTTPException(status_code=409, detail=cfg.conflict_msg)


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


def _norm(s: str | None) -> str:
    return (s or "").lower()


def _is_clean_match(display_name, display_vendor, version, record) -> bool:
    name_ok = _norm(display_name) == _norm(record.name)
    vendor_ok = _norm(display_vendor) == _norm(record.vendor)
    version_ok = (version or "") == (record.version or "")
    return name_ok and vendor_ok and version_ok


def _collect_clean_ids(rows, cfg: _RuleConfig, catalog_value: str, ctx: _CatalogCtx) -> list:
    clean_ids = []
    for row in rows:
        is_vendor = cfg.scan_col == "vendor"
        display_vendor = catalog_value if is_vendor else row[cfg.other_scan_col]
        display_name = row[cfg.other_scan_col] if is_vendor else catalog_value
        _, match = match_plugin(display_name, display_vendor, ctx.catalog_index, ctx.exclusions)
        if match.record is None:
            continue
        if _is_clean_match(display_name, display_vendor, row["version"], match.record):
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
    ctx = _CatalogCtx(
        catalog_index=await build_catalog_index(conn),
        exclusions=await load_exclusions(conn),
        rejection_set=set(),
    )
    rows = await conn.fetch(cfg.ack_scan_sql, rule[cfg.disk_col])
    clean_ids = _collect_clean_ids(rows, cfg, rule[cfg.catalog_col], ctx)
    return await _bulk_confirm(conn, clean_ids, username)


async def _fetch_candidates(conn: Connection, rule_type: str, disk_field: str):
    if rule_type == "vendor":
        return await conn.fetch(
            "SELECT result_id, name, vendor, version FROM plugin_scan_results "
            "WHERE lower(vendor)=$1 AND confirmed_at IS NULL AND status NOT IN ('excluded','ignored')",
            disk_field.lower(),
        )
    return await conn.fetch(
        "SELECT result_id, name, vendor, version FROM plugin_scan_results "
        "WHERE lower(name)=$1 AND confirmed_at IS NULL AND status NOT IN ('excluded','ignored')",
        disk_field.lower(),
    )


async def _load_rejection_set(conn: Connection) -> set[tuple]:
    rows = await conn.fetch("SELECT fingerprint, record_id::text FROM scanner_rejections")
    return {(r["fingerprint"], r["record_id"]) for r in rows}


def _score_row(row, rule_app: _RuleApp, ctx: _CatalogCtx) -> tuple[int, int]:
    display_vendor = rule_app.catalog_value if rule_app.rule_type == "vendor" else row["vendor"]
    display_name = rule_app.catalog_value if rule_app.rule_type == "name" else row["name"]
    _, match = match_plugin(display_name, display_vendor, ctx.catalog_index, ctx.exclusions)
    if match.record is None:
        return 0, 0
    fp = f"{display_vendor} {display_name}".lower().strip()
    if (fp, str(match.record.record_id)) in ctx.rejection_set:
        return 0, 0
    return 1, int(_is_clean_match(display_name, display_vendor, row["version"], match.record))


async def count_affected_with_clean_split(
    conn: Connection, *, rule_type: str, disk_field: str, catalog_value: str,
) -> dict[str, int]:
    ctx = _CatalogCtx(
        catalog_index=await build_catalog_index(conn),
        exclusions=await load_exclusions(conn),
        rejection_set=await _load_rejection_set(conn),
    )
    rule_app = _RuleApp(rule_type=rule_type, catalog_value=catalog_value)
    rows = await _fetch_candidates(conn, rule_type, disk_field)
    affected, clean = 0, 0
    for row in rows:
        a, c = _score_row(row, rule_app, ctx)
        affected += a
        clean += c
    return {"affected_count": affected, "clean_count": clean, "needs_review_count": affected - clean}


async def _count_rules(conn: Connection, rules: list, rule_type: str, ctx: _CatalogCtx) -> dict:
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


# ---------------------------------------------------------------------------
# GET /scanner/rules
# ---------------------------------------------------------------------------

@router.get("/rules")
async def list_rules(
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> AllRules:
    vendor_rows = await conn.fetch(f"SELECT {_VR} FROM scanner_vendor_rules ORDER BY disk_vendor")
    name_rows = await conn.fetch(f"SELECT {_NR} FROM scanner_name_rules ORDER BY disk_name")
    pattern_rows = await conn.fetch(
        "SELECT rule_id, label, pattern, match_fields, action, enabled, is_seeded, "
        "created_by, created_at FROM scanner_name_patterns ORDER BY label"
    )
    ctx = _CatalogCtx(
        catalog_index=await build_catalog_index(conn),
        exclusions=await load_exclusions(conn),
        rejection_set=await _load_rejection_set(conn),
    )
    vendor_counts = await _count_rules(conn, vendor_rows, "vendor", ctx)
    name_counts = await _count_rules(conn, name_rows, "name", ctx)
    return AllRules(
        vendor=[VendorRuleOut(**dict(r), **vendor_counts[r["rule_id"]]) for r in vendor_rows],
        name=[NameRuleOut(**dict(r), **name_counts[r["rule_id"]]) for r in name_rows],
        pattern=[PatternRuleOut(**dict(r)) for r in pattern_rows],
    )


# ---------------------------------------------------------------------------
# Vendor rules
# ---------------------------------------------------------------------------

@router.post("/rules/vendor", status_code=status.HTTP_201_CREATED, responses={409: {"description": "Vendor rule already exists"}})
async def create_vendor_rule(body: VendorRuleIn, user: Annotated[UserOut, Depends(require_admin)], conn: Annotated[Connection, Depends(get_conn)]) -> VendorRuleOut:
    row = await _insert_rule(conn, _VENDOR, _RuleValues(body.disk_vendor, body.catalog_vendor), user.username)
    counts = await count_affected_with_clean_split(conn, rule_type="vendor", disk_field=body.disk_vendor, catalog_value=body.catalog_vendor)
    return VendorRuleOut(**dict(row), **counts)


@router.patch("/rules/vendor/{rule_id}", responses={404: {"description": _VENDOR_NOT_FOUND}})
async def update_vendor_rule(rule_id: UUID, body: VendorRuleUpdate, user: Annotated[UserOut, Depends(require_admin)], conn: Annotated[Connection, Depends(get_conn)]) -> VendorRuleOut:
    row = await _update_rule(conn, _VENDOR, rule_id, body.catalog_vendor)
    counts = await count_affected_with_clean_split(conn, rule_type="vendor", disk_field=row["disk_vendor"], catalog_value=row["catalog_vendor"])
    return VendorRuleOut(**dict(row), **counts)


@router.delete("/rules/vendor/{rule_id}", status_code=status.HTTP_204_NO_CONTENT, responses={404: {"description": _VENDOR_NOT_FOUND}})
async def delete_vendor_rule(rule_id: UUID, _user: Annotated[UserOut, Depends(require_admin)], conn: Annotated[Connection, Depends(get_conn)]) -> None:
    await _delete_rule(conn, _VENDOR, rule_id)


@router.patch("/rules/vendor/{rule_id}/toggle", responses={404: {"description": _VENDOR_NOT_FOUND}})
async def toggle_vendor_rule(rule_id: UUID, body: RuleToggleRequest, _user: Annotated[UserOut, Depends(require_admin)], conn: Annotated[Connection, Depends(get_conn)]) -> VendorRuleOut:
    row = await _toggle_rule(conn, _VENDOR, rule_id, body.enabled)
    return VendorRuleOut(**dict(row), affected_count=0, clean_count=0, needs_review_count=0)


@router.post("/rules/vendor/{rule_id}/acknowledge-clean", responses={404: {"description": _VENDOR_NOT_FOUND}})
async def acknowledge_clean_vendor(rule_id: UUID, user: Annotated[UserOut, Depends(require_admin)], conn: Annotated[Connection, Depends(get_conn)]) -> AcknowledgeCleanResult:
    return await _ack_clean(conn, _VENDOR, rule_id, user.username)


# ---------------------------------------------------------------------------
# Name rules
# ---------------------------------------------------------------------------

@router.post("/rules/name", status_code=status.HTTP_201_CREATED, responses={409: {"description": "Name rule already exists"}})
async def create_name_rule(body: NameRuleIn, user: Annotated[UserOut, Depends(require_admin)], conn: Annotated[Connection, Depends(get_conn)]) -> NameRuleOut:
    row = await _insert_rule(conn, _NAME, _RuleValues(body.disk_name, body.catalog_name), user.username)
    counts = await count_affected_with_clean_split(conn, rule_type="name", disk_field=body.disk_name, catalog_value=body.catalog_name)
    return NameRuleOut(**dict(row), **counts)


@router.patch("/rules/name/{rule_id}", responses={404: {"description": _NAME_NOT_FOUND}})
async def update_name_rule(rule_id: UUID, body: NameRuleUpdate, _user: Annotated[UserOut, Depends(require_admin)], conn: Annotated[Connection, Depends(get_conn)]) -> NameRuleOut:
    row = await _update_rule(conn, _NAME, rule_id, body.catalog_name)
    counts = await count_affected_with_clean_split(conn, rule_type="name", disk_field=row["disk_name"], catalog_value=row["catalog_name"])
    return NameRuleOut(**dict(row), **counts)


@router.delete("/rules/name/{rule_id}", status_code=status.HTTP_204_NO_CONTENT, responses={404: {"description": _NAME_NOT_FOUND}})
async def delete_name_rule(rule_id: UUID, _user: Annotated[UserOut, Depends(require_admin)], conn: Annotated[Connection, Depends(get_conn)]) -> None:
    await _delete_rule(conn, _NAME, rule_id)


@router.patch("/rules/name/{rule_id}/toggle", responses={404: {"description": _NAME_NOT_FOUND}})
async def toggle_name_rule(rule_id: UUID, body: RuleToggleRequest, _user: Annotated[UserOut, Depends(require_admin)], conn: Annotated[Connection, Depends(get_conn)]) -> NameRuleOut:
    row = await _toggle_rule(conn, _NAME, rule_id, body.enabled)
    return NameRuleOut(**dict(row), affected_count=0, clean_count=0, needs_review_count=0)


@router.post("/rules/name/{rule_id}/acknowledge-clean", responses={404: {"description": _NAME_NOT_FOUND}})
async def acknowledge_clean_name(rule_id: UUID, user: Annotated[UserOut, Depends(require_admin)], conn: Annotated[Connection, Depends(get_conn)]) -> AcknowledgeCleanResult:
    return await _ack_clean(conn, _NAME, rule_id, user.username)


# ---------------------------------------------------------------------------
# Pattern rules
# ---------------------------------------------------------------------------

@router.patch("/rules/pattern/{rule_id}/toggle", responses={404: {"description": _PATTERN_NOT_FOUND}})
async def toggle_pattern_rule(rule_id: UUID, body: RuleToggleRequest, _user: Annotated[UserOut, Depends(require_admin)], conn: Annotated[Connection, Depends(get_conn)]) -> PatternRuleOut:
    row = await conn.fetchrow(
        "UPDATE scanner_name_patterns SET enabled=$1 WHERE rule_id=$2 "
        "RETURNING rule_id, label, pattern, match_fields, action, enabled, is_seeded, created_by, created_at",
        body.enabled, rule_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=_PATTERN_NOT_FOUND)
    return PatternRuleOut(**dict(row))
