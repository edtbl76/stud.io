"""Scanner rule management — vendor and name rules (pattern rules: scanner_pattern_rules.py)."""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, status

from database import get_conn
from routers.auth import UserOut, require_admin
from routers.scanner_catalog import build_matching_context
from routers.scanner_pattern_rules import count_patterns
from routers.scanner_rule_counts import (
    _RuleConfig,
    _RuleValues,
    _ack_clean,
    _count_rules,
    _delete_rule,
    _insert_rule,
    _toggle_rule,
    _update_rule,
    count_affected_with_clean_split,
)
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
_VR = "rule_id, disk_vendor, catalog_vendor, enabled, created_by, created_at"
_NR = "rule_id, disk_name, catalog_name, enabled, created_by, created_at"


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
    ctx = await build_matching_context(conn)
    vendor_counts = await _count_rules(conn, vendor_rows, "vendor", ctx)
    name_counts = await _count_rules(conn, name_rows, "name", ctx)
    pattern_counts = await count_patterns(conn, pattern_rows)
    return AllRules(
        vendor=[VendorRuleOut(**dict(r), **vendor_counts[r["rule_id"]]) for r in vendor_rows],
        name=[NameRuleOut(**dict(r), **name_counts[r["rule_id"]]) for r in name_rows],
        pattern=[PatternRuleOut(**dict(r), **pattern_counts[r["rule_id"]]) for r in pattern_rows],
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
