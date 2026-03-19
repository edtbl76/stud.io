import asyncio
import json
import os
from datetime import datetime
from typing import Annotated
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import settings
from database import get_conn
from routers.auth import require_admin, get_current_user, UserOut
from routers._helpers import parent_ref_sql

router = APIRouter()


def _pg_env() -> dict:
    env = os.environ.copy()
    env["PGPASSWORD"] = settings.db_password
    return env


def _pg_args(command: str, db_name: str | None = None) -> list[str]:
    return [
        command,
        "-h", settings.db_host,
        "-p", str(settings.db_port),
        "-U", settings.db_user,
        db_name or settings.db_name,
    ]


def _verify_dsn() -> str:
    return (
        f"postgresql://{settings.db_user}:{settings.db_password}"
        f"@{settings.db_host}:{settings.db_port}/controlroomdb_verify"
    )


async def _run_psql_command(sql: str, db_name: str) -> None:
    """Run a single SQL statement via psql subprocess. Used for CREATE/DROP DATABASE
    which cannot run inside a transaction and therefore cannot use asyncpg."""
    proc = await asyncio.create_subprocess_exec(
        *(_pg_args("psql", db_name=db_name) + ["-c", sql]),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=_pg_env(),
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=stderr.decode())


async def _compute_manifest(conn: asyncpg.Connection) -> dict:
    """Query all public base tables for row counts and content hashes."""
    tables = await conn.fetch(
        """
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
        """
    )
    result = {}
    for row in tables:
        table = row["table_name"]
        stats = await conn.fetchrow(
            f"""
            SELECT
                COUNT(*)::int AS row_count,
                md5(string_agg(row_hash, ',' ORDER BY row_hash)) AS content_hash
            FROM (SELECT md5(t::text) AS row_hash FROM {table} t) sub
            """
        )
        result[table] = {
            "rows": stats["row_count"],
            "hash": stats["content_hash"],
        }
    return result


def _parse_manifest(sql_bytes: bytes) -> dict:
    """Extract and parse the manifest JSON from a backup file's comment block."""
    lines = sql_bytes.decode(errors="replace").splitlines()
    in_block = False
    for line in lines:
        if line == "-- BACKUP MANIFEST BEGIN":
            in_block = True
            continue
        if line == "-- BACKUP MANIFEST END":
            break
        if in_block and line.startswith("-- "):
            try:
                return json.loads(line[3:])
            except json.JSONDecodeError:
                pass
    raise HTTPException(
        status_code=400,
        detail="No valid manifest found. Re-download a fresh backup to enable verification.",
    )


def _compare_manifests(expected: dict, actual: dict) -> dict:
    """Compare expected manifest tables against actual, return structured result."""
    table_results = []
    for table, exp in expected["tables"].items():
        act = actual.get(table, {"rows": None, "hash": None})
        rows_match = act["rows"] == exp["rows"]
        hash_match = act["hash"] == exp["hash"]
        passed = rows_match and hash_match
        table_results.append({
            "table": table,
            "rows_expected": exp["rows"],
            "rows_actual": act["rows"],
            "hash_match": hash_match,
            "passed": passed,
        })
    overall = all(t["passed"] for t in table_results)
    return {
        "passed": overall,
        "created_at": expected.get("created_at"),
        "tables": table_results,
    }


# ---------------------------------------------------------------------------
# Stats models
# ---------------------------------------------------------------------------

class TableStat(BaseModel):
    name: str
    count: int
    pending_creates: int = 0
    pending_deletes: int = 0
    pending_updates: int = 0


class StatGroup(BaseModel):
    label: str
    tables: list[TableStat]


class StatsResponse(BaseModel):
    groups: list[StatGroup]
    total: int


# ---------------------------------------------------------------------------
# Change Review models
# ---------------------------------------------------------------------------

class AuditEntry(BaseModel):
    audit_id: UUID
    table_name: str
    record_id: UUID
    operation: str
    performed_by: str
    performed_at: datetime
    acknowledged_at: datetime | None
    acknowledged_by: str | None
    undone_at: datetime | None
    undone_by: str | None
    record_display_name: str | None = None


class ChangeReviewResponse(BaseModel):
    total: int
    page: int
    page_size: int
    entries: list[AuditEntry]


# Primary key column name for each audited table.
# Table names are hardcoded constants — never sourced from external input.
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


async def _apply_old_data(
    conn: asyncpg.Connection,
    table: str,
    pk_col: str,
    record_id: UUID,
    old_data: dict,
) -> None:
    """Restore a row to its old_data snapshot, excluding PK and created_at."""
    skip = {pk_col, "created_at"}
    set_parts, values, i = [], [], 1
    for col, val in old_data.items():
        if col in skip:
            continue
        if col == "parent_ids":
            set_parts.append(f"{col} = {parent_ref_sql(f'${i}')}")
            values.append(json.dumps(val))
        else:
            set_parts.append(f"{col} = ${i}")
            values.append(val)
        i += 1
    if not set_parts:
        return
    await conn.execute(
        f"UPDATE {table} SET {', '.join(set_parts)} WHERE {pk_col} = ${i}",
        *values, record_id,
    )


@router.get(
    "/change-review",
    response_model=ChangeReviewResponse,
    responses={401: {"description": "Unauthorized"}},
)
async def list_change_review(
    current_user: Annotated[UserOut, Depends(get_current_user)],
    conn: Annotated[asyncpg.Connection, Depends(get_conn)],
    table: str | None = None,
    operation: str | None = None,
    status: str = "pending",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1),
) -> ChangeReviewResponse:
    """Return paginated audit log entries with optional filters."""
    _VALID_STATUSES = {"pending", "acknowledged", "undone", "all"}
    if status not in _VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of: {', '.join(sorted(_VALID_STATUSES))}")

    if page_size > 200:
        page_size = 200

    conditions: list[str] = []
    params: list = []
    i = 1

    if status == "pending":
        conditions.append("acknowledged_at IS NULL AND undone_at IS NULL")
    elif status == "acknowledged":
        conditions.append("acknowledged_at IS NOT NULL")
    elif status == "undone":
        conditions.append("undone_at IS NOT NULL")
    # "all" → no filter

    if table is not None:
        conditions.append(f"table_name = ${i}")
        params.append(table)
        i += 1

    if operation is not None:
        conditions.append(f"operation = ${i}")
        params.append(operation)
        i += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

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

    entries = [AuditEntry(**dict(row), record_display_name=None) for row in rows]
    return ChangeReviewResponse(total=total, page=page, page_size=page_size, entries=entries)


_AUDIT_SELECT = (
    "SELECT audit_id, table_name, record_id, operation, "
    "performed_by, performed_at, "
    "acknowledged_at, acknowledged_by, "
    "undone_at, undone_by, "
    "old_data "
    "FROM audit_log WHERE audit_id = $1"
)


@router.post(
    "/change-review/{audit_id}/acknowledge",
    response_model=AuditEntry,
    responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}},
)
async def acknowledge_change(
    audit_id: UUID,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[asyncpg.Connection, Depends(get_conn)],
) -> AuditEntry:
    """Mark an audit entry as acknowledged."""
    row = await conn.fetchrow(_AUDIT_SELECT, audit_id)
    if not row:
        raise HTTPException(status_code=404, detail="Audit entry not found")
    if row["acknowledged_at"] is not None:
        raise HTTPException(status_code=409, detail="Entry is already acknowledged")
    if row["undone_at"] is not None:
        raise HTTPException(status_code=409, detail="Entry is already undone")

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
    response_model=AuditEntry,
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
    row = await conn.fetchrow(_AUDIT_SELECT, audit_id)
    if not row:
        raise HTTPException(status_code=404, detail="Audit entry not found")
    if row["acknowledged_at"] is not None:
        raise HTTPException(status_code=409, detail="Entry is already acknowledged")
    if row["undone_at"] is not None:
        raise HTTPException(status_code=409, detail="Entry is already undone")

    table = row["table_name"]
    record_id = row["record_id"]
    operation = row["operation"]

    if table not in _TABLE_PK:
        raise HTTPException(status_code=500, detail="Unrecognized table in audit log")
    pk_col = _TABLE_PK[table]

    async with conn.transaction():
        try:
            if operation == "CREATE":
                await conn.execute(
                    f"DELETE FROM {table} WHERE {pk_col} = $1", record_id  # safe: table/pk_col from _TABLE_PK constant
                )
            elif operation == "UPDATE":
                old_data = row["old_data"] or {}
                if isinstance(old_data, str):
                    old_data = json.loads(old_data)
                await _apply_old_data(conn, table, pk_col, record_id, old_data)
            elif operation == "DELETE":
                await conn.execute(
                    f"UPDATE {table} SET deleted_at = NULL WHERE {pk_col} = $1", record_id  # safe: table/pk_col from _TABLE_PK constant
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail="Unrecognized operation in audit log",
                )
        except asyncpg.ForeignKeyViolationError:
            raise HTTPException(
                status_code=409,
                detail="Cannot undo: record is referenced by other records",
            )

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


@router.delete(
    "/change-review/{audit_id}/permanent",
    status_code=204,
    responses={
        400: {"description": "Bad request"},
        404: {"description": "Not found"},
        409: {"description": "Conflict"},
    },
)
async def permanent_delete(
    audit_id: UUID,
    user: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[asyncpg.Connection, Depends(get_conn)],
) -> None:
    """Hard-delete the record referenced by a DELETE audit entry."""
    row = await conn.fetchrow(_AUDIT_SELECT, audit_id)
    if not row:
        raise HTTPException(status_code=404, detail="Audit entry not found")
    if row["acknowledged_at"] is not None:
        raise HTTPException(status_code=409, detail="Entry is already acknowledged")
    if row["undone_at"] is not None:
        raise HTTPException(status_code=409, detail="Entry is already undone")
    if row["operation"] != "DELETE":
        raise HTTPException(
            status_code=400,
            detail="Permanent delete is only valid for DELETE operations",
        )

    table = row["table_name"]
    record_id = row["record_id"]
    if table not in _TABLE_PK:
        raise HTTPException(status_code=500, detail="Unrecognized table in audit log")
    pk_col = _TABLE_PK[table]

    async with conn.transaction():
        await conn.execute(
            f"DELETE FROM {table} WHERE {pk_col} = $1", record_id  # safe: table/pk_col from _TABLE_PK constant
        )
        await conn.execute(
            "UPDATE audit_log SET undone_at = NOW(), undone_by = $2 WHERE audit_id = $1",
            audit_id, user.username,
        )


# Table names below are hardcoded constants — they must never be sourced from
# external input. The `users` table is intentionally excluded; user counts belong
# on the Users page, not the catalog stats page.
# (display_name, table_name, has_soft_delete)
_STATS_GROUPS: list[tuple[str, list[tuple[str, str, bool]]]] = [
    ("Catalog", [
        ("Brands",  "brands",  True),
        ("Models",  "models",  True),
    ]),
    ("Session", [
        ("Effects",      "effects",      True),
        ("Instruments",  "instruments",  True),
        ("Libraries",    "libraries",    True),
        ("Workstations", "workstations", True),
    ]),
    ("Tools", [
        ("Admin",       "admin_tools",       True),
        ("Composition", "composition_tools", True),
        ("Measurement", "measurement_tools", True),
        ("Reference",   "reference_tools",   True),
        ("Workflow",    "workflow_tools",    True),
    ]),
    ("Config", [
        ("Effect Types",      "effect_types",     True),
        ("Entity Types",      "entity_types",     True),
        ("Instrument Types",  "instrument_types", True),
        ("Model Types",       "model_types",      True),
        ("Plugin Formats",    "plugin_formats",   True),
        ("Tag Types",         "tag_types",        True),
        ("Tool Types",        "tool_types",       True),
    ]),
]


@router.get("/stats")
async def stats(
    _: Annotated[UserOut, Depends(require_admin)],
    conn: Annotated[asyncpg.Connection, Depends(get_conn)],
) -> StatsResponse:
    """Return row counts for all content and lookup tables, grouped by category."""
    groups: list[StatGroup] = []
    total = 0

    for label, table_triples in _STATS_GROUPS:
        table_stats: list[TableStat] = []
        for display_name, table_name, has_soft_delete in table_triples:
            if has_soft_delete:
                row = await conn.fetchrow(
                    f"SELECT COUNT(*)::int AS cnt FROM {table_name} WHERE deleted_at IS NULL"  # safe: table_name from _STATS_GROUPS constant
                )
            else:
                row = await conn.fetchrow(
                    f"SELECT COUNT(*)::int AS cnt FROM {table_name}"  # safe: table_name from _STATS_GROUPS constant
                )
            active_count = row["cnt"]

            # Pending change counts from audit_log
            pending_row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE operation = 'CREATE') ::int AS creates,
                    COUNT(*) FILTER (WHERE operation = 'DELETE') ::int AS deletes,
                    COUNT(*) FILTER (WHERE operation = 'UPDATE') ::int AS updates
                FROM audit_log
                WHERE table_name = $1
                  AND acknowledged_at IS NULL
                  AND undone_at IS NULL
                """,
                table_name,
            )
            pending_creates = pending_row["creates"]
            pending_deletes = pending_row["deletes"]
            pending_updates = pending_row["updates"]

            adjusted_count = active_count - pending_creates + pending_deletes
            table_stats.append(TableStat(
                name=display_name,
                count=adjusted_count,
                pending_creates=pending_creates,
                pending_deletes=pending_deletes,
                pending_updates=pending_updates,
            ))
            total += adjusted_count

        table_stats.sort(key=lambda t: (-t.count, t.name))
        groups.append(StatGroup(label=label, tables=table_stats))

    return StatsResponse(groups=groups, total=total)


@router.get("/backup", responses={500: {"description": "Internal server error"}})
async def backup(_: Annotated[UserOut, Depends(require_admin)]):
    """Dump controlroomdb to a SQL file with embedded manifest and return as download."""
    proc = await asyncio.create_subprocess_exec(
        *(_pg_args("pg_dump") + ["--clean", "--if-exists"]),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=_pg_env(),
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=stderr.decode())

    try:
        conn = await asyncpg.connect(dsn=settings.db_dsn)
        try:
            tables = await _compute_manifest(conn)
        finally:
            await conn.close()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Manifest generation failed: {e}")

    manifest = {
        "created_at": datetime.now().isoformat(),
        "database": settings.db_name,
        "tables": tables,
    }
    manifest_json = json.dumps(manifest, separators=(",", ":"))
    manifest_block = (
        b"-- BACKUP MANIFEST BEGIN\n"
        + b"-- " + manifest_json.encode() + b"\n"
        + b"-- BACKUP MANIFEST END\n\n"
    )

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"controlroomdb_{timestamp}.sql"

    return StreamingResponse(
        iter([manifest_block + stdout]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/restore", responses={400: {"description": "Bad request"}, 500: {"description": "Internal server error"}})
async def restore(file: Annotated[UploadFile, File(...)], _: Annotated[UserOut, Depends(require_admin)]):
    """Restore controlroomdb from an uploaded SQL file."""
    if not file.filename or not file.filename.endswith(".sql"):
        raise HTTPException(status_code=400, detail="File must be a .sql file")

    sql_bytes = await file.read()

    proc = await asyncio.create_subprocess_exec(
        *_pg_args("psql"),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=_pg_env(),
    )
    _, stderr = await proc.communicate(input=sql_bytes)
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=stderr.decode())

    return {"status": "ok", "message": "Database restored successfully"}


@router.post("/verify", responses={400: {"description": "Bad request"}, 500: {"description": "Internal server error"}})
async def verify(file: Annotated[UploadFile, File(...)], _: Annotated[UserOut, Depends(require_admin)]):
    """Verify a backup file by restoring to a temp DB and comparing content hashes."""
    if not file.filename or not file.filename.endswith(".sql"):
        raise HTTPException(status_code=400, detail="File must be a .sql file")

    sql_bytes = await file.read()
    manifest = _parse_manifest(sql_bytes)

    conn = None
    try:
        await _run_psql_command("DROP DATABASE IF EXISTS controlroomdb_verify", db_name="postgres")
        await _run_psql_command("CREATE DATABASE controlroomdb_verify", db_name="postgres")

        proc = await asyncio.create_subprocess_exec(
            *_pg_args("psql", db_name="controlroomdb_verify"),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=_pg_env(),
        )
        _, stderr = await proc.communicate(input=sql_bytes)
        if proc.returncode != 0:
            raise HTTPException(status_code=500, detail=stderr.decode())

        conn = await asyncpg.connect(dsn=_verify_dsn())
        actual = await _compute_manifest(conn)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {e}")
    finally:
        if conn:
            await conn.close()
        try:
            await _run_psql_command("DROP DATABASE IF EXISTS controlroomdb_verify", db_name="postgres")
        except Exception:
            pass

    return _compare_manifests(manifest, actual)
