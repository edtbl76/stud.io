"""Shared router utilities."""
import uuid
from datetime import datetime


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


async def log_audit(
    conn,
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
