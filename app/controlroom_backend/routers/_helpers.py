"""Shared router utilities."""
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Mapping, Optional, Sequence
from uuid import UUID

import asyncpg
from fastapi import HTTPException
from pydantic import BaseModel


class AuditEntry(BaseModel):
    audit_id: UUID
    table_name: str
    record_id: UUID
    operation: str
    performed_by: str
    performed_at: datetime
    acknowledged_at: datetime | None = None
    acknowledged_by: str | None = None
    undone_at: datetime | None = None
    undone_by: str | None = None
    record_display_name: str | None = None


class ChangeReviewResponse(BaseModel):
    total: int
    page: int
    page_size: int
    entries: list[AuditEntry]


class AuditEntryWithData(BaseModel):
    audit_id: uuid.UUID
    table_name: str
    record_id: uuid.UUID
    operation: str
    performed_by: str
    performed_at: datetime
    old_data: dict | None = None
    new_data: dict | None = None
    acknowledged_at: datetime | None = None
    acknowledged_by: str | None = None
    undone_at: datetime | None = None
    undone_by: str | None = None
    record_display_name: str | None = None


# Audit table metadata — hardcoded constants, never sourced from external input.
_NAME_COL: dict[str, str] = {
    "brands":              "brand_name",
    "models":              "model_name",
    "effects":             "effect_name",
    "instruments":         "instrument_name",
    "libraries":           "library_name",
    "workstations":        "tool_name",
    "admin_tools":         "tool_name",
    "composition_tools":   "tool_name",
    "measurement_tools":   "tool_name",
    "reference_tools":     "tool_name",
    "workflow_tools":      "tool_name",
    "effect_types":        "type_name",
    "entity_types":        "type_name",
    "instrument_types":    "type_name",
    "model_types":         "type_name",
    "plugin_formats":      "type_name",
    "tag_types":           "type_name",
    "tool_types":          "type_name",
}

_TABLE_PK: dict[str, str] = {
    "brands":              "brand_id",
    "models":              "model_id",
    "effects":             "effect_id",
    "instruments":         "instrument_id",
    "libraries":           "library_id",
    "workstations":        "workstation_id",
    "admin_tools":         "admin_tool_id",
    "composition_tools":   "composition_tool_id",
    "measurement_tools":   "measurement_tool_id",
    "reference_tools":     "reference_tool_id",
    "workflow_tools":      "workflow_tool_id",
    "effect_types":        "type_id",
    "entity_types":        "type_id",
    "instrument_types":    "type_id",
    "model_types":         "type_id",
    "plugin_formats":      "type_id",
    "tag_types":           "type_id",
    "tool_types":          "type_id",
}

_VALID_STATUSES = {"pending", "acknowledged", "undone", "all"}

# new_data is intentionally excluded: the undo and permanent-delete handlers only
# need the old snapshot to restore or confirm deletion; fetching new_data here
# would double the JSON transfer size for no benefit in these paths.
_AUDIT_SELECT = (
    "SELECT audit_id, table_name, record_id, operation, "
    "performed_by, performed_at, "
    "acknowledged_at, acknowledged_by, "
    "undone_at, undone_by, "
    "old_data "
    "FROM audit_log WHERE audit_id = $1"
)

_NOT_FOUND = "Audit entry not found"
_ALREADY_ACKNOWLEDGED = "Entry is already acknowledged"
_ALREADY_UNDONE = "Entry is already undone"


# SQL expression that converts a JSON parameter ($N) to parent_ref[].
# Usage: embed in INSERT/UPDATE SQL, pass json.dumps([{table_name, id}, ...]) as the param.
PARENT_REF_EXPR = """COALESCE(
    (SELECT ARRAY_AGG(ROW(x.table_name, x.id::UUID)::parent_ref)
     FROM jsonb_to_recordset({placeholder}::jsonb) AS x(table_name TEXT, id UUID)),
    ARRAY[]::parent_ref[]
)"""


def parent_ref_sql(placeholder: str) -> str:
    """Return the SQL expression for encoding parent_ref[], e.g. parent_ref_sql('$5')."""
    return PARENT_REF_EXPR.format(placeholder=placeholder)


def encode_parent_refs(parents) -> list:
    """Return a Python list for asyncpg to encode as jsonb via the registered codec."""
    if not parents:
        return []
    return [{"table_name": p.table_name, "id": str(p.id)} for p in parents]


def build_update_parts(updates: Mapping[str, Any], parent_ids: Optional[Sequence[Any]]) -> tuple[list[str], list[Any]]:
    """Build (set_parts, values) for a PATCH update, with positional params starting at $2.

    Handles parent_ids specially; all other fields are passed through as-is.
    asyncpg's registered type codecs handle JSONB serialization automatically.
    Callers must append 'updated_at = NOW()' and the record ID ($1) separately.
    """
    set_parts: list[str] = []
    values: list = []
    i = 2
    for col, val in updates.items():
        if col == "parent_ids":
            set_parts.append(f"{col} = {parent_ref_sql(f'${i}')}")
            values.append(encode_parent_refs(parent_ids))
        else:
            set_parts.append(f"{col} = ${i}")
            values.append(val)
        i += 1
    return set_parts, values


async def fetch_mutable_entry(
    conn: asyncpg.Connection,
    audit_id: UUID,
) -> asyncpg.Record:
    """Fetch an audit entry and raise if not found, acknowledged, or already undone.

    The DB enforces acknowledged and undone as mutually exclusive states via
    audit_log_state_exclusive, so both flags must be checked before any write.
    """
    row = await conn.fetchrow(_AUDIT_SELECT, audit_id)
    if not row:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    if row["acknowledged_at"] is not None:
        raise HTTPException(status_code=409, detail=_ALREADY_ACKNOWLEDGED)
    if row["undone_at"] is not None:
        raise HTTPException(status_code=409, detail=_ALREADY_UNDONE)
    return row


_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_ISO_DT_RE = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}")


def _coerce_value(val: object) -> object:
    """Convert JSON-deserialized strings back to asyncpg-compatible Python types.

    JSONB round-trip strips type information: UUIDs and datetimes become plain
    strings.  asyncpg needs the original Python types to bind them correctly to
    typed PostgreSQL columns (uuid, timestamptz, uuid[], …).
    """
    if isinstance(val, str):
        if _UUID_RE.match(val):
            return uuid.UUID(val)
        if _ISO_DT_RE.match(val):
            dt = datetime.fromisoformat(val)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
    if isinstance(val, list):
        return [_coerce_value(item) for item in val]
    return val


async def apply_old_data(
    conn: asyncpg.Connection,
    table: str,
    pk_col: str,
    record_id: UUID,
    old_data: dict,
) -> None:
    """Restore a row to its old_data snapshot, excluding PK, created_at, and updated_at."""
    skip = {pk_col, "created_at", "updated_at"}
    set_parts, values, i = [], [], 1
    for col, val in old_data.items():
        if col in skip:
            continue
        if col == "parent_ids":
            set_parts.append(f"{col} = {parent_ref_sql(f'${i}')}")
            values.append(val)
        else:
            set_parts.append(f"{col} = ${i}")
            values.append(_coerce_value(val))
        i += 1
    if not set_parts:
        return
    await conn.execute(
        f"UPDATE {table} SET {', '.join(set_parts)} WHERE {pk_col} = ${i}",
        *values, record_id,
    )


async def get_record_history(
    conn: asyncpg.Connection,
    table_name: str,
    record_id: uuid.UUID,
) -> list[AuditEntryWithData]:
    """Return audit log entries for a single record, sorted performed_at DESC."""
    rows = await conn.fetch(
        """SELECT audit_id, table_name, record_id, operation,
                  performed_by, performed_at,
                  old_data, new_data,
                  acknowledged_at, acknowledged_by,
                  undone_at, undone_by
           FROM audit_log
           WHERE table_name = $1 AND record_id = $2
           ORDER BY performed_at DESC""",
        table_name, record_id,
    )
    result = []
    for row in rows:
        d = dict(row)
        for field in ("old_data", "new_data"):
            val = d.get(field)
            if isinstance(val, str):
                d[field] = json.loads(val)
        result.append(AuditEntryWithData(**d, record_display_name=None))
    return result


async def log_audit(
    conn: asyncpg.Connection,
    table_name: str,
    record_id: uuid.UUID,
    operation: str,
    performed_by: str,
    old_data: dict | None = None,
    new_data: dict | None = None,
) -> None:
    """Insert one row into audit_log inside the caller's transaction."""
    await conn.execute(
        """
        INSERT INTO audit_log
            (table_name, record_id, operation, old_data, new_data, performed_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        table_name,
        record_id,
        operation,
        old_data,
        new_data,
        performed_by,
    )


def _serialize_value(v: object) -> object:
    """Convert a single asyncpg value to a JSON-serializable form.

    Handles:
    - uuid.UUID → str
    - datetime → str
    - list → each element recursed through _serialize_value
    - asyncpg composite type (e.g. parent_ref) → dict, via .items()
    - plain dict (e.g. decoded JSONB column) → recurse to handle nested UUIDs/datetimes
    - None, str, int, float, bool → pass through unchanged
    """
    if isinstance(v, (uuid.UUID, datetime)):
        return str(v)
    if isinstance(v, list):
        return [_serialize_value(i) for i in v]
    # Both asyncpg composite Records and plain Python dicts have .items().
    # Recursing into plain dicts handles nested UUIDs/datetimes in JSONB columns.
    if hasattr(v, "items"):
        return {k: _serialize_value(val) for k, val in v.items()}
    return v


def _serializable(row: dict) -> dict:
    """Convert a dict(asyncpg.Record) to a fully JSON-serializable dict for audit storage."""
    return {k: _serialize_value(v) for k, v in row.items()}
