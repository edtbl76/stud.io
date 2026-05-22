"""Scanner rule management — vendor, name, and pattern rules."""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_conn
from routers.auth import UserOut, require_admin
from routers.scanner_match import (
    build_catalog_index,
    load_exclusions,
    match_plugin,
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
_PATTERN_NOT_FOUND = "Pattern rule not found"


async def _fetch_candidates(conn: Connection, rule_type: str, disk_field: str):
    if rule_type == "vendor":
        return await conn.fetch(
            "SELECT result_id, name, vendor, version, format "
            "FROM plugin_scan_results "
            "WHERE lower(vendor) = $1 AND confirmed_at IS NULL "
            "AND status NOT IN ('excluded', 'ignored')",
            disk_field.lower(),
        )
    return await conn.fetch(
        "SELECT result_id, name, vendor, version, format "
        "FROM plugin_scan_results "
        "WHERE lower(name) = $1 AND confirmed_at IS NULL "
        "AND status NOT IN ('excluded', 'ignored')",
        disk_field.lower(),
    )


async def _score_row(
    conn: Connection,
    row,
    rule_type: str,
    catalog_value: str,
    catalog_index,
    exclusions,
) -> tuple[int, int]:
    """Return (affected, clean) counts for a single candidate row."""
    display_vendor = catalog_value if rule_type == "vendor" else row["vendor"]
    display_name = catalog_value if rule_type == "name" else row["name"]
    _, match = match_plugin(display_name, display_vendor, catalog_index, exclusions)
    if match.record is None:
        return 0, 0
    fp = f"{display_vendor} {display_name}".lower().strip()
    rejected = await conn.fetchrow(
        "SELECT 1 FROM scanner_rejections WHERE fingerprint=$1 AND record_id=$2",
        fp, UUID(match.record.record_id),
    )
    if rejected:
        return 0, 0
    is_clean = (
        (display_name or "").lower() == (match.record.name or "").lower()
        and (display_vendor or "").lower() == (match.record.vendor or "").lower()
        and (row["version"] or "") == (match.record.version or "")
    )
    return 1, int(is_clean)


async def count_affected_with_clean_split(
    conn: Connection,
    *,
    rule_type: str,
    disk_field: str,
    catalog_value: str,
) -> dict[str, int]:
    """Return {affected_count, clean_count, needs_review_count} for a rule."""
    catalog_index = await build_catalog_index(conn)
    exclusions = await load_exclusions(conn)
    rows = await _fetch_candidates(conn, rule_type, disk_field)
    affected, clean = 0, 0
    for row in rows:
        a, c = await _score_row(conn, row, rule_type, catalog_value, catalog_index, exclusions)
        affected += a
        clean += c
    return {
        "affected_count": affected,
        "clean_count": clean,
        "needs_review_count": affected - clean,
    }


async def _get_latest_scan_id(conn: Connection) -> UUID | None:
    row = await conn.fetchrow(
        "SELECT scan_id FROM plugin_scans ORDER BY scanned_at DESC LIMIT 1"
    )
    return row["scan_id"] if row else None


# ---------------------------------------------------------------------------
# GET /scanner/rules
# ---------------------------------------------------------------------------

@router.get("/rules")
async def list_rules(
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> AllRules:
    vendor_rows = await conn.fetch(
        "SELECT rule_id, disk_vendor, catalog_vendor, enabled, created_by, created_at "
        "FROM scanner_vendor_rules ORDER BY disk_vendor"
    )
    name_rows = await conn.fetch(
        "SELECT rule_id, disk_name, catalog_name, enabled, created_by, created_at "
        "FROM scanner_name_rules ORDER BY disk_name"
    )
    pattern_rows = await conn.fetch(
        "SELECT rule_id, label, pattern, match_fields, action, enabled, is_seeded, "
        "created_by, created_at FROM scanner_name_patterns ORDER BY label"
    )
    return AllRules(
        vendor=[VendorRuleOut(**dict(r), affected_count=0, clean_count=0, needs_review_count=0)
                for r in vendor_rows],
        name=[NameRuleOut(**dict(r), affected_count=0, clean_count=0, needs_review_count=0)
              for r in name_rows],
        pattern=[PatternRuleOut(**dict(r)) for r in pattern_rows],
    )


# ---------------------------------------------------------------------------
# Vendor rules
# ---------------------------------------------------------------------------

@router.post(
    "/rules/vendor",
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "Vendor rule already exists"}},
)
async def create_vendor_rule(
    body: VendorRuleIn,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> VendorRuleOut:
    try:
        row = await conn.fetchrow(
            "INSERT INTO scanner_vendor_rules (disk_vendor, catalog_vendor, created_by) "
            "VALUES ($1, $2, $3) RETURNING rule_id, disk_vendor, catalog_vendor, "
            "enabled, created_by, created_at",
            body.disk_vendor.lower(), body.catalog_vendor, user.username,
        )
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Vendor rule for this disk_vendor already exists")
        raise
    counts = await count_affected_with_clean_split(
        conn, rule_type="vendor",
        disk_field=body.disk_vendor, catalog_value=body.catalog_vendor,
    )
    return VendorRuleOut(**dict(row), **counts)


@router.patch(
    "/rules/vendor/{rule_id}",
    responses={404: {"description": _VENDOR_NOT_FOUND}},
)
async def update_vendor_rule(
    rule_id: UUID,
    body: VendorRuleUpdate,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> VendorRuleOut:
    row = await conn.fetchrow(
        "UPDATE scanner_vendor_rules SET catalog_vendor=$1 WHERE rule_id=$2 "
        "RETURNING rule_id, disk_vendor, catalog_vendor, enabled, created_by, created_at",
        body.catalog_vendor, rule_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=_VENDOR_NOT_FOUND)
    counts = await count_affected_with_clean_split(
        conn, rule_type="vendor",
        disk_field=row["disk_vendor"], catalog_value=row["catalog_vendor"],
    )
    return VendorRuleOut(**dict(row), **counts)


@router.delete(
    "/rules/vendor/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": _VENDOR_NOT_FOUND}},
)
async def delete_vendor_rule(
    rule_id: UUID,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> None:
    result = await conn.execute(
        "DELETE FROM scanner_vendor_rules WHERE rule_id=$1", rule_id
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail=_VENDOR_NOT_FOUND)


@router.patch(
    "/rules/vendor/{rule_id}/toggle",
    responses={404: {"description": _VENDOR_NOT_FOUND}},
)
async def toggle_vendor_rule(
    rule_id: UUID,
    body: RuleToggleRequest,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> VendorRuleOut:
    row = await conn.fetchrow(
        "UPDATE scanner_vendor_rules SET enabled=$1 WHERE rule_id=$2 "
        "RETURNING rule_id, disk_vendor, catalog_vendor, enabled, created_by, created_at",
        body.enabled, rule_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=_VENDOR_NOT_FOUND)
    return VendorRuleOut(**dict(row), affected_count=0, clean_count=0, needs_review_count=0)


@router.post(
    "/rules/vendor/{rule_id}/acknowledge-clean",
    responses={404: {"description": _VENDOR_NOT_FOUND}},
)
async def acknowledge_clean_vendor(
    rule_id: UUID,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> AcknowledgeCleanResult:
    rule = await conn.fetchrow(
        "SELECT disk_vendor, catalog_vendor FROM scanner_vendor_rules WHERE rule_id=$1", rule_id
    )
    if not rule:
        raise HTTPException(status_code=404, detail=_VENDOR_NOT_FOUND)
    catalog_index = await build_catalog_index(conn)
    exclusions = await load_exclusions(conn)
    rows = await conn.fetch(
        "SELECT result_id, name, vendor, version FROM plugin_scan_results "
        "WHERE lower(vendor) = $1 AND confirmed_at IS NULL",
        rule["disk_vendor"],
    )
    clean_ids = []
    for row in rows:
        display_vendor = rule["catalog_vendor"]
        display_name = row["name"]
        _, match = match_plugin(display_name, display_vendor, catalog_index, exclusions)
        if match.record is None:
            continue
        is_clean = (
            display_name.lower() == (match.record.name or "").lower()
            and display_vendor.lower() == (match.record.vendor or "").lower()
            and (row["version"] or "") == (match.record.version or "")
        )
        if is_clean:
            clean_ids.append(row["result_id"])
    if clean_ids:
        result = await conn.execute(
            "UPDATE plugin_scan_results SET confirmed_at=NOW(), confirmed_by=$1 "
            "WHERE result_id = ANY($2::uuid[]) AND confirmed_at IS NULL",
            user.username, clean_ids,
        )
        acknowledged = int(result.split()[-1])
    else:
        acknowledged = 0
    return AcknowledgeCleanResult(acknowledged=acknowledged)


# ---------------------------------------------------------------------------
# Name rules
# ---------------------------------------------------------------------------

@router.post(
    "/rules/name",
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "Name rule already exists"}},
)
async def create_name_rule(
    body: NameRuleIn,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> NameRuleOut:
    try:
        row = await conn.fetchrow(
            "INSERT INTO scanner_name_rules (disk_name, catalog_name, created_by) "
            "VALUES ($1, $2, $3) RETURNING rule_id, disk_name, catalog_name, "
            "enabled, created_by, created_at",
            body.disk_name.lower(), body.catalog_name, user.username,
        )
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Name rule for this disk_name already exists")
        raise
    counts = await count_affected_with_clean_split(
        conn, rule_type="name",
        disk_field=body.disk_name, catalog_value=body.catalog_name,
    )
    return NameRuleOut(**dict(row), **counts)


@router.patch(
    "/rules/name/{rule_id}",
    responses={404: {"description": _NAME_NOT_FOUND}},
)
async def update_name_rule(
    rule_id: UUID,
    body: NameRuleUpdate,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> NameRuleOut:
    row = await conn.fetchrow(
        "UPDATE scanner_name_rules SET catalog_name=$1 WHERE rule_id=$2 "
        "RETURNING rule_id, disk_name, catalog_name, enabled, created_by, created_at",
        body.catalog_name, rule_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=_NAME_NOT_FOUND)
    counts = await count_affected_with_clean_split(
        conn, rule_type="name",
        disk_field=row["disk_name"], catalog_value=row["catalog_name"],
    )
    return NameRuleOut(**dict(row), **counts)


@router.delete(
    "/rules/name/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": _NAME_NOT_FOUND}},
)
async def delete_name_rule(
    rule_id: UUID,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> None:
    result = await conn.execute(
        "DELETE FROM scanner_name_rules WHERE rule_id=$1", rule_id
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail=_NAME_NOT_FOUND)


@router.patch(
    "/rules/name/{rule_id}/toggle",
    responses={404: {"description": _NAME_NOT_FOUND}},
)
async def toggle_name_rule(
    rule_id: UUID,
    body: RuleToggleRequest,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> NameRuleOut:
    row = await conn.fetchrow(
        "UPDATE scanner_name_rules SET enabled=$1 WHERE rule_id=$2 "
        "RETURNING rule_id, disk_name, catalog_name, enabled, created_by, created_at",
        body.enabled, rule_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=_NAME_NOT_FOUND)
    return NameRuleOut(**dict(row), affected_count=0, clean_count=0, needs_review_count=0)


@router.post(
    "/rules/name/{rule_id}/acknowledge-clean",
    responses={404: {"description": _NAME_NOT_FOUND}},
)
async def acknowledge_clean_name(
    rule_id: UUID,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> AcknowledgeCleanResult:
    rule = await conn.fetchrow(
        "SELECT disk_name, catalog_name FROM scanner_name_rules WHERE rule_id=$1", rule_id
    )
    if not rule:
        raise HTTPException(status_code=404, detail=_NAME_NOT_FOUND)
    catalog_index = await build_catalog_index(conn)
    exclusions = await load_exclusions(conn)
    rows = await conn.fetch(
        "SELECT result_id, name, vendor, version FROM plugin_scan_results "
        "WHERE lower(name) = $1 AND confirmed_at IS NULL",
        rule["disk_name"],
    )
    clean_ids = []
    for row in rows:
        display_name = rule["catalog_name"]
        display_vendor = row["vendor"]
        _, match = match_plugin(display_name, display_vendor, catalog_index, exclusions)
        if match.record is None:
            continue
        is_clean = (
            display_name.lower() == (match.record.name or "").lower()
            and display_vendor.lower() == (match.record.vendor or "").lower()
            and (row["version"] or "") == (match.record.version or "")
        )
        if is_clean:
            clean_ids.append(row["result_id"])
    if clean_ids:
        result = await conn.execute(
            "UPDATE plugin_scan_results SET confirmed_at=NOW(), confirmed_by=$1 "
            "WHERE result_id = ANY($2::uuid[]) AND confirmed_at IS NULL",
            user.username, clean_ids,
        )
        acknowledged = int(result.split()[-1])
    else:
        acknowledged = 0
    return AcknowledgeCleanResult(acknowledged=acknowledged)


# ---------------------------------------------------------------------------
# Pattern rules
# ---------------------------------------------------------------------------

@router.patch(
    "/rules/pattern/{rule_id}/toggle",
    responses={404: {"description": _PATTERN_NOT_FOUND}},
)
async def toggle_pattern_rule(
    rule_id: UUID,
    body: RuleToggleRequest,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> PatternRuleOut:
    row = await conn.fetchrow(
        "UPDATE scanner_name_patterns SET enabled=$1 WHERE rule_id=$2 "
        "RETURNING rule_id, label, pattern, match_fields, action, enabled, "
        "is_seeded, created_by, created_at",
        body.enabled, rule_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=_PATTERN_NOT_FOUND)
    return PatternRuleOut(**dict(row))
