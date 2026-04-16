import json
from typing import Annotated
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query

from database import get_conn
from routers.auth import require_admin, get_current_user, UserOut
from routers._helpers import (
    AuditEntry,
    AuditEntryWithData,
    ChangeReviewResponse,
    _TABLE_PK,
    _VALID_STATUSES,
    _NOT_FOUND,
    fetch_mutable_entry,
)
from routers.change_review_undo import apply_undo_operation, UndoTarget
from routers.change_review_list import _build_filter_clause, _batch_display_names, _build_entries

router = APIRouter()


@router.get(
    "/change-review",
    responses={401: {"description": "Unauthorized"}, 422: {"description": "Invalid status"}},
)
async def list_change_review(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[asyncpg.Connection, Depends(get_conn)],
    table: str | None = None,
    operation: str | None = None,
    status: str = "pending",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1)] = 50,
) -> ChangeReviewResponse:
    """Return paginated audit log entries with optional filters."""
    if status not in _VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of: {', '.join(sorted(_VALID_STATUSES))}")

    if page_size > 200:
        page_size = 200

    where, params = _build_filter_clause(status, table, operation)
    i = len(params) + 1

    total = await conn.fetchval(
        f"SELECT COUNT(*)::int FROM audit_log {where}", *params  # safe: conditions built from literals and $N placeholders only
    )

    offset = (page - 1) * page_size
    rows = await conn.fetch(
        f"""
        SELECT audit_id, table_name, record_id, operation,
               performed_by, performed_at,
               acknowledged_at, acknowledged_by,
               undone_at, undone_by
        FROM audit_log
        {where}
        ORDER BY performed_at DESC
        LIMIT ${i} OFFSET ${i+1}
        """,  # safe: where clause built from literals and $N placeholders only
        *params, page_size, offset,
    )

    display_names = await _batch_display_names(conn, rows)
    entries = _build_entries(rows, display_names)
    return ChangeReviewResponse(total=total, page=page, page_size=page_size, entries=entries)


@router.get(
    "/change-review/{audit_id}",
    responses={401: {"description": "Unauthorized"}, 404: {"description": "Not found"}},
)
async def get_change_detail(
    audit_id: UUID,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[asyncpg.Connection, Depends(get_conn)],
) -> AuditEntryWithData:
    """Return a single audit entry including old_data and new_data for diff display."""
    row = await conn.fetchrow(
        """SELECT audit_id, table_name, record_id, operation,
                  performed_by, performed_at,
                  old_data, new_data,
                  acknowledged_at, acknowledged_by,
                  undone_at, undone_by
           FROM audit_log WHERE audit_id = $1""",
        audit_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    row_dict = dict(row)
    for field in ("old_data", "new_data"):
        val = row_dict.get(field)
        if isinstance(val, str):
            row_dict[field] = json.loads(val)
    return AuditEntryWithData(**row_dict, record_display_name=None)


@router.post(
    "/change-review/{audit_id}/acknowledge",
    responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}},
)
async def acknowledge_change(
    audit_id: UUID,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[asyncpg.Connection, Depends(get_conn)],
) -> AuditEntry:
    """Mark an audit entry as acknowledged."""
    await fetch_mutable_entry(conn, audit_id)

    updated = await conn.fetchrow(
        """UPDATE audit_log
           SET acknowledged_at = NOW(), acknowledged_by = $2
           WHERE audit_id = $1
           RETURNING audit_id, table_name, record_id, operation,
                     performed_by, performed_at,
                     acknowledged_at, acknowledged_by,
                     undone_at, undone_by""",
        audit_id, user.username,
    )
    return AuditEntry(**dict(updated), record_display_name=None)


@router.post(
    "/change-review/{audit_id}/undo",
    responses={
        404: {"description": "Not found"},
        409: {"description": "Conflict"},
        500: {"description": "Unrecognized table"},
    },
)
async def undo_change(
    audit_id: UUID,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[asyncpg.Connection, Depends(get_conn)],
) -> AuditEntry:
    """Reverse the original database operation."""
    row = await fetch_mutable_entry(conn, audit_id)

    table = row["table_name"]
    record_id = row["record_id"]
    operation = row["operation"]

    if table not in _TABLE_PK:
        raise HTTPException(status_code=500, detail="Unrecognized table in audit log")
    pk_col = _TABLE_PK[table]

    try:
        async with conn.transaction():
            await apply_undo_operation(conn, UndoTarget(table, pk_col, record_id), operation, row["old_data"])

            updated = await conn.fetchrow(
                """UPDATE audit_log
                   SET undone_at = NOW(), undone_by = $2
                   WHERE audit_id = $1
                   RETURNING audit_id, table_name, record_id, operation,
                             performed_by, performed_at,
                             acknowledged_at, acknowledged_by,
                             undone_at, undone_by""",
                audit_id, user.username,
            )
        return AuditEntry(**dict(updated), record_display_name=None)
    except asyncpg.ForeignKeyViolationError:
        raise HTTPException(status_code=409, detail="Cannot undo: record is referenced by other records")


@router.delete(
    "/change-review/{audit_id}/permanent",
    status_code=204,
    responses={
        400: {"description": "Bad request"},
        404: {"description": "Not found"},
        409: {"description": "Conflict"},
        500: {"description": "Unrecognized table"},
    },
)
async def permanent_delete(
    audit_id: UUID,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[asyncpg.Connection, Depends(get_conn)],
) -> None:
    """Hard-delete the record referenced by a DELETE audit entry."""
    row = await fetch_mutable_entry(conn, audit_id)
    if row["operation"] != "DELETE":
        raise HTTPException(status_code=400, detail="Permanent delete is only valid for DELETE operations")

    table = row["table_name"]
    record_id = row["record_id"]
    if table not in _TABLE_PK:
        raise HTTPException(status_code=500, detail="Unrecognized table in audit log")
    pk_col = _TABLE_PK[table]

    try:
        async with conn.transaction():
            await conn.execute(
                f"DELETE FROM {table} WHERE {pk_col} = $1", record_id  # safe: table/pk_col from _TABLE_PK constant
            )
            await conn.execute(
                "UPDATE audit_log SET undone_at = NOW(), undone_by = $2 WHERE audit_id = $1",
                audit_id, user.username,
            )
    except asyncpg.ForeignKeyViolationError:
        raise HTTPException(status_code=409, detail="Cannot permanently delete: record is referenced by other records")
