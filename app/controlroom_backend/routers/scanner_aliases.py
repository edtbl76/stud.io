"""Scanner direct name-alias writes (U-19 Set Name Alias).

An admin-only ``POST /scanner/aliases`` that maps a raw scanned disk name to a catalog
record, feeding the U-14 ingest alias precedence (link → alias → exclusion → fuzzy).
Reuses U-14's ``ON CONFLICT (disk_name) DO UPDATE ... RETURNING`` trick so a divergent
existing alias surfaces as a 409 instead of being silently overwritten.
"""
from __future__ import annotations

from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, HTTPException, status

from database import get_conn
from routers.auth import UserOut, require_admin
from routers.scanner_catalog import CATALOG_TABLES
from schemas.scanner_aliases import AliasOut, CreateAliasRequest

router = APIRouter()

_ALIAS_COLS = "alias_id, disk_name, catalog_record_id, catalog_table, created_by, created_at"


async def _assert_target_exists(conn: Connection, table: str, record_id: UUID) -> None:
    """404 if the catalog table is unknown or the record is missing/soft-deleted."""
    if table not in CATALOG_TABLES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Unknown catalog table: {table}")
    pk, _ = CATALOG_TABLES[table]
    exists = await conn.fetchval(
        f"SELECT 1 FROM {table} WHERE {pk}=$1 AND deleted_at IS NULL", record_id,
    )
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Record {record_id} not found in {table}")


async def _upsert_alias(conn: Connection, body: CreateAliasRequest, username: str) -> dict:
    """Record-aware upsert. The no-op DO UPDATE lets RETURNING surface the stored row,
    so an existing alias to a different record is detected (and rejected) by the caller."""
    row = await conn.fetchrow(
        f"INSERT INTO scanner_name_aliases (disk_name, catalog_record_id, catalog_table, created_by) "
        f"VALUES ($1, $2, $3, $4) "
        f"ON CONFLICT (disk_name) DO UPDATE SET disk_name = scanner_name_aliases.disk_name "
        f"RETURNING {_ALIAS_COLS}",
        body.disk_name, body.catalog_record_id, body.catalog_table, username,
    )
    return dict(row)


@router.post("/aliases", status_code=status.HTTP_201_CREATED,
             responses={404: {"description": "Unknown catalog table or missing record"},
                        409: {"description": "Disk name already aliased to a different record"}})
async def create_alias(
    body: CreateAliasRequest,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> AliasOut:
    async with conn.transaction():
        await _assert_target_exists(conn, body.catalog_table, body.catalog_record_id)
        row = await _upsert_alias(conn, body, user.username)
        if (row["catalog_table"] != body.catalog_table
                or str(row["catalog_record_id"]) != str(body.catalog_record_id)):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{body.disk_name} is already aliased to "
                       f"{row['catalog_table']} {row['catalog_record_id']}",
            )
    return AliasOut(**row)
