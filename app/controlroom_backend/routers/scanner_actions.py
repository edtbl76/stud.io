"""Plugin Scanner — confirm action handlers and scan ingest helpers.

Imported by scanner.py. Contains:
- Confirm action dispatch (apply_confirmation)
- Orphan row insertion (insert_orphans)
"""
from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from asyncpg import Connection

from routers._helpers import log_audit
from routers.scanner_match import CATALOG_TABLES
from schemas.scanner import Confirmation


@dataclass
class _ConfirmCtx:
    c: Confirmation
    row: dict
    fp: str
    username: str


async def _upsert_plugin_link(
    conn: Connection, ctx: _ConfirmCtx, rid: object, table: str,
) -> None:
    await conn.execute(
        "INSERT INTO scanner_plugin_links "
        "(scanned_vendor,scanned_name,fingerprint,record_id,record_table,confirmed_by) "
        "VALUES ($1,$2,$3,$4,$5,$6) "
        "ON CONFLICT (fingerprint) DO UPDATE SET record_id=$4,record_table=$5,"
        "confirmed_at=NOW(),confirmed_by=$6",
        ctx.row["vendor"], ctx.row["name"], ctx.fp, rid, table, ctx.username,
    )


async def _action_confirm(conn: Connection, ctx: _ConfirmCtx) -> None:
    table, rid = ctx.row["record_table"], ctx.row["record_id"]
    if table not in CATALOG_TABLES:
        raise ValueError(
            f"result_id {ctx.c.result_id}: unknown record_table {table!r}"
        )
    pk, _ = CATALOG_TABLES[table]
    old = await conn.fetchrow(f"SELECT version FROM {table} WHERE {pk}=$1", rid)
    if old is None:
        raise ValueError(
            f"result_id {ctx.c.result_id}: catalog record {rid} in {table!r} no longer exists"
        )
    await conn.execute(
        "UPDATE plugin_scan_results SET status='matched',confirmed_at=NOW(),"
        "confirmed_by=$2 WHERE result_id=$1", ctx.c.result_id, ctx.username,
    )
    await conn.execute(
        f"UPDATE {table} SET version=$1,updated_at=NOW() WHERE {pk}=$2", ctx.row["version"], rid,
    )
    await log_audit(conn, table, rid, "UPDATE", ctx.username,
                    old_data=dict(old) if old else None,
                    new_data={"version": ctx.row["version"]})
    await _upsert_plugin_link(conn, ctx, rid, table)


async def _action_reject(conn: Connection, ctx: _ConfirmCtx) -> None:
    await conn.execute(
        "UPDATE plugin_scan_results SET status='untracked',confirmed_at=NOW(),"
        "confirmed_by=$2,record_id=NULL,record_table=NULL,confidence=NULL,score=NULL "
        "WHERE result_id=$1", ctx.c.result_id, ctx.username,
    )
    await conn.execute("DELETE FROM scanner_plugin_links WHERE fingerprint=$1", ctx.fp)


async def _action_ignore(conn: Connection, ctx: _ConfirmCtx) -> None:
    await conn.execute(
        "INSERT INTO scanner_exclusions (vendor,name) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        ctx.row["vendor"], ctx.row["name"],
    )
    await conn.execute("DELETE FROM scanner_plugin_links WHERE fingerprint=$1", ctx.fp)
    await conn.execute(
        "UPDATE plugin_scan_results SET status='ignored',confirmed_at=NOW(),"
        "confirmed_by=$2 WHERE result_id=$1", ctx.c.result_id, ctx.username,
    )


async def _action_create(conn: Connection, ctx: _ConfirmCtx) -> None:
    if not ctx.c.target_table or ctx.c.target_table not in CATALOG_TABLES:
        raise ValueError(f"invalid target_table: {ctx.c.target_table}")
    pk, nc = CATALOG_TABLES[ctx.c.target_table]
    new_id = await conn.fetchval(
        f"INSERT INTO {ctx.c.target_table} ({nc},version) VALUES ($1,$2) RETURNING {pk}",
        ctx.row["name"], ctx.row["version"],
    )
    await log_audit(conn, ctx.c.target_table, new_id, "CREATE", ctx.username,
                    new_data={"name": ctx.row["name"], "version": ctx.row["version"]})
    await conn.execute(
        "UPDATE plugin_scan_results SET status='matched',record_id=$1,record_table=$2,"
        "confirmed_at=NOW(),confirmed_by=$3 WHERE result_id=$4",
        new_id, ctx.c.target_table, ctx.username, ctx.c.result_id,
    )
    await _upsert_plugin_link(conn, ctx, new_id, ctx.c.target_table)


async def _assert_catalog_row_exists(conn: Connection, table: str, record_id: str, result_id: object) -> None:
    pk, _ = CATALOG_TABLES[table]
    exists = await conn.fetchval(
        f"SELECT 1 FROM {table} WHERE {pk}=$1 AND deleted_at IS NULL", record_id
    )
    if not exists:
        raise ValueError(f"result_id {result_id}: record {record_id} not found in {table}")


async def _action_acknowledge(conn: Connection, ctx: _ConfirmCtx) -> None:
    table = ctx.row["record_table"]
    rid = ctx.row["record_id"]
    if table not in CATALOG_TABLES or not rid:
        raise ValueError(f"result_id {ctx.c.result_id}: cannot acknowledge without a linked catalog record")
    await _assert_catalog_row_exists(conn, table, str(rid), ctx.c.result_id)
    await conn.execute(
        "UPDATE plugin_scan_results SET confirmed_at=NOW(), confirmed_by=$2 WHERE result_id=$1",
        ctx.c.result_id, ctx.username,
    )
    await _upsert_plugin_link(conn, ctx, rid, table)


async def _action_force(conn: Connection, ctx: _ConfirmCtx) -> None:
    if not ctx.c.target_id or not ctx.c.target_table:
        raise ValueError("force action requires target_id and target_table")
    if ctx.c.target_table not in CATALOG_TABLES:
        raise ValueError(f"unknown target_table: {ctx.c.target_table!r}")
    target_id_uuid = UUID(ctx.c.target_id)
    await _assert_catalog_row_exists(conn, ctx.c.target_table, ctx.c.target_id, ctx.c.result_id)
    await conn.execute(
        "UPDATE plugin_scan_results "
        "SET status='matched', record_id=$1, record_table=$2, "
        "confirmed_at=NOW(), confirmed_by=$3 "
        "WHERE result_id=$4",
        target_id_uuid, ctx.c.target_table, ctx.username, ctx.c.result_id,
    )
    await _upsert_plugin_link(conn, ctx, target_id_uuid, ctx.c.target_table)


_ACTIONS = {
    "confirm":     _action_confirm,
    "reject":      _action_reject,
    "ignore":      _action_ignore,
    "create":      _action_create,
    "acknowledge": _action_acknowledge,
    "force":       _action_force,
}


async def apply_confirmation(conn: Connection, c: Confirmation, username: str) -> None:
    row = await conn.fetchrow(
        "SELECT name,vendor,version,record_id,record_table "
        "FROM plugin_scan_results WHERE result_id=$1", c.result_id,
    )
    if not row:
        raise ValueError(f"result_id {c.result_id} not found")
    fp = f"{row['vendor']} {row['name']}".lower().strip()
    handler = _ACTIONS.get(c.action)
    if not handler:
        raise ValueError(f"unknown action: {c.action}")
    await handler(conn, _ConfirmCtx(c=c, row=dict(row), fp=fp, username=username))


# ---------------------------------------------------------------------------
# Orphan row insertion (used by ingest_scan)
# ---------------------------------------------------------------------------

async def _insert_orphan_row(
    conn: Connection, scan_id: UUID, record_id: str, table: str,
) -> None:
    pk, nc = CATALOG_TABLES.get(table, (None, None))
    if not pk:
        return
    rec = await conn.fetchrow(
        f"SELECT {nc} AS name, b.brand_name AS vendor, t.version "
        f"FROM {table} t LEFT JOIN brands b ON t.brand_id=b.brand_id WHERE {pk}=$1",
        UUID(record_id),
    )
    if not rec:
        return
    vendor = rec["vendor"] or ""
    version = rec["version"] or ""
    await conn.execute(
        "INSERT INTO plugin_scan_results "
        "(scan_id,name,vendor,version,format,path,status,confidence,record_id,record_table)"
        " VALUES ($1,$2,$3,$4,'unknown','','orphaned','exact',$5,$6)",
        scan_id, rec["name"], vendor, version, UUID(record_id), table,
    )


async def insert_orphans(
    conn: Connection,
    scan_id: UUID,
    links: dict[str, tuple[str, str]],
    seen: set[str],
) -> None:
    for fp, (record_id, table) in links.items():
        if fp not in seen:
            await _insert_orphan_row(conn, scan_id, record_id, table)
