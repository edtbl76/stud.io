"""DB reversal logic for the change-review undo endpoint."""
import json
from typing import NamedTuple
from uuid import UUID

import asyncpg
from fastapi import HTTPException

from routers._helpers import apply_old_data

_MISSING_OLD_DATA = "Cannot undo: old_data is missing from this audit entry"
_UNRECOGNIZED_OP = "Unrecognized operation in audit log"


class UndoTarget(NamedTuple):
    """Identifies the record being reversed and its primary-key column."""
    table: str
    pk_col: str
    record_id: UUID


def _resolve_old_data(old_data: dict | str | None) -> dict:
    """Decode and validate old_data for an UPDATE reversal."""
    if isinstance(old_data, str):
        old_data = json.loads(old_data)
    if not isinstance(old_data, dict) or not old_data:
        raise HTTPException(status_code=409, detail=_MISSING_OLD_DATA)
    return old_data


async def apply_undo_operation(
    conn: asyncpg.Connection,
    target: UndoTarget,
    operation: str,
    old_data: dict | str | None,
) -> None:
    """Execute the DB reversal for a single audit operation inside the caller's transaction."""
    if operation == "CREATE":
        await conn.execute(
            f"UPDATE {target.table} SET deleted_at = NOW() WHERE {target.pk_col} = $1",  # safe: table/pk_col from _TABLE_PK constant
            target.record_id,
        )
    elif operation == "UPDATE":
        await apply_old_data(conn, target.table, target.pk_col, target.record_id, _resolve_old_data(old_data))
    elif operation == "DELETE":
        await conn.execute(
            f"UPDATE {target.table} SET deleted_at = NULL WHERE {target.pk_col} = $1",  # safe: table/pk_col from _TABLE_PK constant
            target.record_id,
        )
    else:
        raise HTTPException(status_code=500, detail=_UNRECOGNIZED_OP)
