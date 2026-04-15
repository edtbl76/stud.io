"""List-endpoint helpers for the change-review router."""
from collections import defaultdict

import asyncpg

from routers._helpers import AuditEntry, _NAME_COL, _TABLE_PK

_STATUS_CONDITIONS: dict[str, str] = {
    "pending": "acknowledged_at IS NULL AND undone_at IS NULL",
    "acknowledged": "acknowledged_at IS NOT NULL",
    "undone": "undone_at IS NOT NULL",
}


def _build_filter_clause(
    status: str, table: str | None, operation: str | None
) -> tuple[str, list]:
    """Build the WHERE clause and parameter list for the audit log query."""
    conditions: list[str] = []
    params: list = []
    i = 1
    status_cond = _STATUS_CONDITIONS.get(status)
    if status_cond:
        conditions.append(status_cond)
    if table is not None:
        conditions.append(f"table_name = ${i}")
        params.append(table)
        i += 1
    if operation is not None:
        conditions.append(f"operation = ${i}")
        params.append(operation)
        i += 1
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    return where, params


def _group_ids_by_table(rows: list[asyncpg.Record]) -> dict[str, list]:
    """Group record IDs by table_name for tables that have a known display-name column."""
    by_table: dict[str, list] = defaultdict(list)
    for row in rows:
        if row["table_name"] in _NAME_COL:
            by_table[row["table_name"]].append(row["record_id"])
    return dict(by_table)


async def _fetch_names_for_table(
    conn: asyncpg.Connection, tbl: str, ids: list
) -> dict[tuple[str, object], str]:
    """Fetch (table, pk) → name entries for a single table."""
    name_col = _NAME_COL[tbl]
    pk_col = _TABLE_PK[tbl]
    name_rows = await conn.fetch(
        f"SELECT {pk_col}, {name_col} FROM {tbl} WHERE {pk_col} = ANY($1::uuid[])",  # safe: name_col/pk_col/tbl from constants
        ids,
    )
    return {(tbl, nr[pk_col]): nr[name_col] for nr in name_rows}


async def _batch_display_names(
    conn: asyncpg.Connection,
    rows: list[asyncpg.Record],
) -> dict[tuple[str, object], str]:
    """Resolve display names in one query per distinct table instead of one per row."""
    result: dict[tuple[str, object], str] = {}
    for tbl, ids in _group_ids_by_table(rows).items():
        result.update(await _fetch_names_for_table(conn, tbl, ids))
    return result


def _build_entries(
    rows: list[asyncpg.Record],
    display_names: dict[tuple[str, object], str],
) -> list[AuditEntry]:
    """Assemble AuditEntry objects, attaching display names from the pre-fetched lookup."""
    entries = []
    for row in rows:
        d = dict(row)
        tbl = d["table_name"]
        record_id = d["record_id"]
        key = (tbl, record_id)
        if key in display_names:
            display_name: str | None = display_names[key]
        elif tbl in _NAME_COL:
            display_name = str(record_id)[:8]
        else:
            display_name = None
        entries.append(AuditEntry(**d, record_display_name=display_name))
    return entries
