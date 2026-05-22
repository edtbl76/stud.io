"""Plugin Scanner — admin routes.

  GET    /scanner/keys             — list API keys
  POST   /scanner/keys             — create new API key
  DELETE /scanner/keys/{key_id}    — revoke API key
  GET    /scanner/exclusions       — list exclusions
  POST   /scanner/exclude          — add to exclusion list
  DELETE /scanner/exclude/{id}     — remove from exclusion list
  GET    /scanner/scans            — scan history with counts
  DELETE /scanner/scans            — purge old scans

  U-02 additions (additive — no existing endpoints modified):
  POST   /scanner/admin/reset/soft — disable all rules
  POST   /scanner/admin/reset/hard — full wipe + re-seed
"""
from __future__ import annotations

import secrets
from typing import Annotated
from uuid import UUID

import bcrypt
from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from database import get_conn
from limiter import limiter
from routers.auth import UserOut, get_current_user, require_admin
from schemas.scanner import (
    APIKeyCreated, APIKeyResponse,
    ConfirmationCounts, CreateExclusionRequest,
    CreateKeyRequest, ExclusionOut, PurgeResult, ScanRun, StatusCounts,
)

router = APIRouter()

KEY_PREFIX = "psc_"
KEY_BYTES  = 32
_HINT_LEN  = 4

_SCAN_HISTORY_SQL = (
    "SELECT ps.scan_id, ps.scanned_at, ps.source_machine, ps.total_count, "
    "COUNT(*) FILTER (WHERE r.status='known') AS known, "
    "COUNT(*) FILTER (WHERE r.status='matched') AS matched, "
    "COUNT(*) FILTER (WHERE r.status='conflicted') AS conflicted, "
    "COUNT(*) FILTER (WHERE r.status='unconfirmed') AS unconfirmed, "
    "COUNT(*) FILTER (WHERE r.status='untracked') AS untracked, "
    "COUNT(*) FILTER (WHERE r.status='orphaned') AS orphaned, "
    "COUNT(*) FILTER (WHERE r.confirmed_by IS NOT NULL AND r.status IN ('known','matched')) AS confirmed, "
    "COUNT(*) FILTER (WHERE r.confirmed_by IS NOT NULL AND r.status='untracked') AS rejected, "
    "COUNT(*) FILTER (WHERE r.status='ignored') AS ignored "
    "FROM plugin_scans ps "
    "LEFT JOIN plugin_scan_results r ON r.scan_id = ps.scan_id "
    "GROUP BY ps.scan_id, ps.scanned_at, ps.source_machine, ps.total_count "
    "ORDER BY ps.scanned_at DESC"
)


# ---------------------------------------------------------------------------
# API key management
# ---------------------------------------------------------------------------

@router.get("/keys")
async def list_keys(
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> list[APIKeyResponse]:
    rows = await conn.fetch(
        "SELECT key_id, label, key_hint, created_at, revoked_at "
        "FROM scanner_api_keys ORDER BY created_at DESC"
    )
    return [APIKeyResponse(**dict(r)) for r in rows]


@router.post("/keys", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/hour")
async def create_key(
    request: Request,
    payload: CreateKeyRequest,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> APIKeyCreated:
    raw = KEY_PREFIX + secrets.token_hex(KEY_BYTES)
    hint = raw[-_HINT_LEN:]
    hashed = bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()
    row = await conn.fetchrow(
        "INSERT INTO scanner_api_keys (label, key_hint, hashed_key) "
        "VALUES ($1, $2, $3) RETURNING key_id, label, key_hint, created_at, revoked_at",
        payload.label, hint, hashed,
    )
    return APIKeyCreated(**dict(row), key=raw)


@router.delete(
    "/keys/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "Key not found or already revoked"}},
)
async def revoke_key(
    key_id: UUID,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> None:
    result = await conn.execute(
        "UPDATE scanner_api_keys SET revoked_at=NOW() "
        "WHERE key_id=$1 AND revoked_at IS NULL",
        key_id,
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Key not found or already revoked")


# ---------------------------------------------------------------------------
# Exclusion management
# ---------------------------------------------------------------------------

@router.get("/exclusions")
async def list_exclusions(
    _user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> list[ExclusionOut]:
    rows = await conn.fetch(
        "SELECT exclusion_id, vendor, name, excluded_at "
        "FROM scanner_exclusions ORDER BY excluded_at DESC"
    )
    return [ExclusionOut(**dict(r)) for r in rows]


@router.post("/exclude", status_code=status.HTTP_204_NO_CONTENT)
async def add_exclusion(
    payload: CreateExclusionRequest,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> None:
    await conn.execute(
        "INSERT INTO scanner_exclusions (vendor, name) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        payload.vendor, payload.name,
    )


@router.delete(
    "/exclude/{exclusion_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "Exclusion not found"}},
)
async def remove_exclusion(
    exclusion_id: UUID,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> None:
    result = await conn.execute(
        "DELETE FROM scanner_exclusions WHERE exclusion_id=$1", exclusion_id,
    )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Exclusion not found")


# ---------------------------------------------------------------------------
# Scan history
# ---------------------------------------------------------------------------

@router.get("/scans")
async def list_scans(
    _user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> list[ScanRun]:
    rows = await conn.fetch(_SCAN_HISTORY_SQL)
    return [
        ScanRun(
            scan_id=r["scan_id"],
            scanned_at=r["scanned_at"],
            source_machine=r["source_machine"],
            total_count=r["total_count"],
            status_counts=StatusCounts(
                known=r["known"],
                matched=r["matched"],
                conflicted=r["conflicted"],
                unconfirmed=r["unconfirmed"],
                untracked=r["untracked"],
                orphaned=r["orphaned"],
                ignored=r["ignored"],
            ),
            confirmation_counts=ConfirmationCounts(
                confirmed=r["confirmed"],
                rejected=r["rejected"],
                ignored=r["ignored"],
            ),
        )
        for r in rows
    ]


@router.delete("/scans")
async def purge_scans(
    older_than_days: Annotated[int, Query(ge=1)],
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> PurgeResult:
    result = await conn.execute(
        "DELETE FROM plugin_scans WHERE scanned_at < NOW() - ($1 * INTERVAL '1 day')",
        older_than_days,
    )
    deleted = int(result.split()[-1])
    return PurgeResult(deleted_count=deleted)


# ---------------------------------------------------------------------------
# U-02: Reset endpoints (additive — existing endpoints above are unchanged)
# ---------------------------------------------------------------------------

from schemas.scanner_workbench import ResetRequest, ResetResult  # noqa: E402

_HARD_RESET_CONFIRMATION = "RESET ALL SCANNER DATA"


@router.post("/admin/reset/soft")
async def reset_soft(
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> ResetResult:
    """Disable all rules without deleting any data. Reversible."""
    async with conn.transaction():
        vr = await conn.execute("UPDATE scanner_vendor_rules SET enabled=FALSE")
        nr = await conn.execute("UPDATE scanner_name_rules SET enabled=FALSE")
        pr = await conn.execute("UPDATE scanner_name_patterns SET enabled=FALSE")
    total = sum(int(s.split()[-1]) for s in (vr, nr, pr))
    return ResetResult(type="soft", rules_disabled=total)


@router.post("/admin/reset/hard", responses={422: {"description": "Invalid confirmation text"}})
async def reset_hard(
    body: ResetRequest,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> ResetResult:
    """Full wipe of all scan data and rules. Seeded pattern rules survive (set disabled).

    Requires exact confirmation text: 'RESET ALL SCANNER DATA'.
    """
    if body.confirmation_text != _HARD_RESET_CONFIRMATION:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=422,
            detail=f"confirmation_text must be exactly '{_HARD_RESET_CONFIRMATION}'",
        )

    async with conn.transaction():
        results_deleted = int(
            (await conn.execute("DELETE FROM plugin_scan_results")).split()[-1]
        )
        await conn.execute("DELETE FROM plugin_scans")
        await conn.execute("DELETE FROM scanner_vendor_rules")
        await conn.execute("DELETE FROM scanner_name_rules")
        await conn.execute("DELETE FROM scanner_name_aliases")
        await conn.execute("DELETE FROM scanner_rejections")
        await conn.execute("DELETE FROM scanner_exclusions")
        await conn.execute(
            "DELETE FROM scanner_name_patterns WHERE is_seeded = FALSE"
        )
        seeded = int(
            (await conn.execute(
                "UPDATE scanner_name_patterns SET enabled=FALSE WHERE is_seeded=TRUE"
            )).split()[-1]
        )

    return ResetResult(
        type="hard",
        records_wiped=results_deleted,
        seeded_rules_restored=seeded,
    )
