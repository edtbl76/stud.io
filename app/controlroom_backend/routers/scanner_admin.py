"""Plugin Scanner — admin routes.

  GET    /scanner/keys             — list API keys
  POST   /scanner/keys             — create new API key
  DELETE /scanner/keys/{key_id}    — revoke API key
  POST   /scanner/exclude          — add to exclusion list
  DELETE /scanner/exclude/{id}     — remove from exclusion list
  GET    /scanner/scans            — scan history with counts
  DELETE /scanner/scans            — purge old scans
"""
from __future__ import annotations

import secrets
from typing import Annotated
from uuid import UUID

import bcrypt
from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, Query, status

from database import get_conn
from routers.auth import UserOut, get_current_user, require_admin
from schemas.scanner import (
    APIKeyCreated, APIKeyResponse,
    ConfirmationCounts, CreateExclusionRequest,
    CreateKeyRequest, PurgeResult, ScanRun, StatusCounts,
)

router = APIRouter()

KEY_PREFIX = "psc_"
KEY_BYTES  = 32
_HINT_LEN  = 4

_SCAN_HISTORY_SQL = (
    "SELECT ps.scan_id, ps.scanned_at, ps.source_machine, ps.total_count, "
    "COUNT(*) FILTER (WHERE r.status='matched') AS matched, "
    "COUNT(*) FILTER (WHERE r.status='version_mismatch') AS version_mismatch, "
    "COUNT(*) FILTER (WHERE r.status='unconfirmed') AS unconfirmed, "
    "COUNT(*) FILTER (WHERE r.status='untracked') AS untracked, "
    "COUNT(*) FILTER (WHERE r.status='orphaned') AS orphaned, "
    "COUNT(*) FILTER (WHERE r.confirmed_by IS NOT NULL AND r.status='matched') AS confirmed, "
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
async def create_key(
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
                matched=r["matched"],
                version_mismatch=r["version_mismatch"],
                unconfirmed=r["unconfirmed"],
                untracked=r["untracked"],
                orphaned=r["orphaned"],
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
