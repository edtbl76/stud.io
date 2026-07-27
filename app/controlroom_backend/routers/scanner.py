"""Plugin Scanner — catalog search, and result actions.

  GET   /scanner/catalog/search            — catalog search for manual linking
  PATCH /scanner/results/{id}/dismiss      — dismiss an orphaned result
  PATCH /scanner/results/{result_id}/keep  — permanently keep a confirmed link
  POST  /scanner/confirm                   — apply user decisions

Scan ingest (`POST /scanner/scan`) lives in `scanner_ingest`; the read-only Scan
Report lives in `scanner_report`; auth deps in `scanner_auth`.
"""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, Response

from database import get_conn
from routers.auth import UserOut, get_current_user, require_admin
from routers.scanner_actions import apply_confirmation
from routers.scanner_catalog import CATALOG_TABLES, catalog_search_query
from schemas.scanner import (
    CatalogSearchResult,
    CollisionResolveRequest,
    CollisionResolveResult,
    Confirmation,
    ConfirmPayload,
    ConfirmResult,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /catalog/search
# ---------------------------------------------------------------------------

@router.get("/catalog/search", responses={400: {"description": "Unknown table"}})
async def catalog_search(
    q: str,
    _user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[Connection, Depends(get_conn)],
    table: str | None = None,
) -> list[CatalogSearchResult]:
    pattern = f"%{q}%"
    if table and table not in CATALOG_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown table: {table!r}")
    if table:
        pk, name_col = CATALOG_TABLES[table]
        sql = (
            f"SELECT {pk}::text AS record_id, '{table}' AS record_table, "
            f"{name_col} AS name, b.brand_name AS vendor, t.version "
            f"FROM {table} t LEFT JOIN brands b ON t.brand_id = b.brand_id "
            f"WHERE t.deleted_at IS NULL "
            f"AND ({name_col} ILIKE $1 OR b.brand_name ILIKE $1) "
            f"ORDER BY {name_col} LIMIT 20"
        )
    else:
        sql = (
            f"SELECT * FROM ({catalog_search_query()}) u "
            f"WHERE (name ILIKE $1 OR vendor ILIKE $1) "
            f"ORDER BY name LIMIT 20"
        )
    rows = await conn.fetch(sql, pattern)
    return [CatalogSearchResult(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# PATCH /results/{result_id}/dismiss
# ---------------------------------------------------------------------------

async def _update_or_404(conn: Connection, sql: str, pk: UUID, detail: str) -> None:
    if not await conn.fetchval(sql, pk):
        raise HTTPException(status_code=404, detail=detail)


@router.patch("/results/{result_id}/dismiss", responses={404: {"description": "Scan result not found"}})
async def dismiss_result(
    result_id: UUID,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
    response: Response,
) -> None:
    await _update_or_404(
        conn,
        "UPDATE plugin_scan_results SET dismissed_at = NOW() WHERE result_id = $1 RETURNING result_id",
        result_id,
        "Scan result not found",
    )
    response.status_code = 204


# ---------------------------------------------------------------------------
# PATCH /results/{result_id}/keep
# ---------------------------------------------------------------------------

@router.patch("/results/{result_id}/keep", status_code=204, responses={404: {"description": "Scan result or link not found"}})
async def keep_result(
    result_id: UUID,
    _user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> None:
    row = await conn.fetchrow(
        "SELECT vendor, name FROM plugin_scan_results WHERE result_id = $1", result_id
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Scan result not found")
    fingerprint = f"{row['vendor']} {row['name']}".lower().strip()
    updated = await conn.fetchval(
        "UPDATE scanner_plugin_links SET keep_permanently = TRUE "
        "WHERE fingerprint = $1 AND keep_permanently = FALSE RETURNING link_id",
        fingerprint,
    )
    if updated is None:
        existing = await conn.fetchval(
            "SELECT link_id FROM scanner_plugin_links WHERE fingerprint = $1", fingerprint
        )
        if existing is None:
            raise HTTPException(status_code=404, detail="No confirmed link found for this result")


# ---------------------------------------------------------------------------
# POST /confirm
# ---------------------------------------------------------------------------

@router.post("/confirm")
async def confirm_results(
    payload: ConfirmPayload,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> ConfirmResult:
    applied, errors = 0, []
    for c in payload.confirmations:
        try:
            async with conn.transaction():
                await apply_confirmation(conn, c, user.username)
            applied += 1
        except ValueError as exc:
            errors.append({"result_id": str(c.result_id), "error": str(exc)})
    return ConfirmResult(applied=applied, errors=errors)


# ---------------------------------------------------------------------------
# POST /collisions/resolve
# ---------------------------------------------------------------------------

async def _resolve_keep_all(conn: Connection, copy_ids: list[UUID], username: str) -> CollisionResolveResult:
    for rid in copy_ids:
        await apply_confirmation(conn, Confirmation(result_id=rid, action="acknowledge"), username)
    return CollisionResolveResult(acknowledged=len(copy_ids), dismissed=0)


async def _lock_copies(conn: Connection, copy_ids: list[UUID]) -> tuple[list[UUID], list]:
    """Row-lock the copy rows; reject duplicate, missing, or already-dismissed IDs."""
    unique = list(dict.fromkeys(copy_ids))
    if len(unique) != len(copy_ids):
        raise ValueError("copy_ids must not contain duplicates")
    rows = await conn.fetch(
        "SELECT record_table, record_id, lower(format) AS fmt FROM plugin_scan_results "
        "WHERE result_id = ANY($1::uuid[]) AND dismissed_at IS NULL FOR UPDATE",
        unique,
    )
    if len(rows) != len(unique):
        raise ValueError("every copy_id must be a live scan result")
    return unique, rows


def _single_anchored_key(rows: list) -> tuple:
    """Return the one (table, record_id, fmt) the rows share, or raise if not a single anchored group."""
    keys = {(r["record_table"], r["record_id"], r["fmt"]) for r in rows}
    if len(keys) != 1:
        raise ValueError("copy_ids must all belong to one collision")
    key = keys.pop()
    if None in key[:2]:
        raise ValueError("copy_ids must belong to a catalog-anchored collision")
    return key


async def _require_one_collision(conn: Connection, unique: list[UUID], rows: list) -> None:
    """Require the locked rows to be exactly one complete collision set (no outside members)."""
    table, record_id, fmt = _single_anchored_key(rows)
    outsiders = await conn.fetchval(
        "SELECT COUNT(*) FROM plugin_scan_results "
        "WHERE record_table=$1 AND record_id=$2 AND lower(format)=$3 "
        "AND dismissed_at IS NULL AND result_id <> ALL($4::uuid[])",
        table, record_id, fmt, unique,
    )
    if outsiders:
        raise ValueError("copy_ids must be the complete collision set")


async def _resolve_remove_straggler(
    conn: Connection, copy_ids: list[UUID], keeper_id: UUID | None, username: str,
) -> CollisionResolveResult:
    if keeper_id not in copy_ids:  # a None keeper is likewise absent from a list of UUIDs
        raise ValueError("remove_straggler requires keeper_id to be one of copy_ids")
    unique, rows = await _lock_copies(conn, copy_ids)
    await _require_one_collision(conn, unique, rows)
    await apply_confirmation(conn, Confirmation(result_id=keeper_id, action="acknowledge"), username)
    dismissed = await conn.fetchval(
        "WITH upd AS (UPDATE plugin_scan_results SET dismissed_at=NOW() "
        "WHERE result_id = ANY($1::uuid[]) AND result_id <> $2 AND dismissed_at IS NULL RETURNING 1) "
        "SELECT COUNT(*) FROM upd",
        unique, keeper_id,
    )
    return CollisionResolveResult(acknowledged=1, dismissed=dismissed)


@router.post("/collisions/resolve", responses={400: {"description": "Invalid collision resolution"}})
async def resolve_collision(
    req: CollisionResolveRequest,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> CollisionResolveResult:
    """Resolve a whole collision in one transaction — all copies apply or none do."""
    try:
        async with conn.transaction():
            if req.action == "keep_all":
                return await _resolve_keep_all(conn, req.copy_ids, user.username)
            return await _resolve_remove_straggler(conn, req.copy_ids, req.keeper_id, user.username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
