import asyncio
import json
import os
from datetime import datetime
from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import settings
from database import get_conn
from routers.auth import require_admin, UserOut

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


class StatGroup(BaseModel):
    label: str
    tables: list[TableStat]


class StatsResponse(BaseModel):
    groups: list[StatGroup]
    total: int


# Table names below are hardcoded constants — they must never be sourced from
# external input. The `users` table is intentionally excluded; user counts belong
# on the Users page, not the catalog stats page.
_STATS_GROUPS: list[tuple[str, list[tuple[str, str]]]] = [
    ("Catalog", [
        ("Brands", "brands"),
        ("Models", "models"),
    ]),
    ("Session", [
        ("Effects", "effects"),
        ("Instruments", "instruments"),
        ("Libraries", "libraries"),
        ("Workstations", "workstations"),
    ]),
    ("Tools", [
        ("Admin", "admin_tools"),
        ("Composition", "composition_tools"),
        ("Measurement", "measurement_tools"),
        ("Reference", "reference_tools"),
        ("Workflow", "workflow_tools"),
    ]),
    ("Config", [
        ("Effect Types", "effect_types"),
        ("Entity Types", "entity_types"),
        ("Instrument Types", "instrument_types"),
        ("Model Types", "model_types"),
        ("Plugin Formats", "plugin_formats"),
        ("Tag Types", "tag_types"),
        ("Tool Types", "tool_types"),
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

    for label, table_pairs in _STATS_GROUPS:
        table_stats: list[TableStat] = []
        for display_name, table_name in table_pairs:
            row = await conn.fetchrow(f"SELECT COUNT(*)::int AS cnt FROM {table_name}")  # safe: table_name is from _STATS_GROUPS (hardcoded constant)
            count = row["cnt"]
            table_stats.append(TableStat(name=display_name, count=count))
            total += count

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
