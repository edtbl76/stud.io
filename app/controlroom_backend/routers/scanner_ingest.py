"""Plugin Scanner — scan ingest (`POST /scanner/scan`).

Resolution precedence per scanned plugin: persistent link (fingerprint) → name
alias (`disk_name`, U-14) → exclusion → 3-tier fuzzy matching. Confirmed links and
aliases both resolve with `confidence='exact'`. The whole ingest is one transaction.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends

from database import get_conn
from routers.scanner_actions import insert_orphans
from routers.scanner_auth import get_scanner_auth
from routers.scanner_catalog import (
    CATALOG_TABLES,
    CatalogRecord,
    build_catalog_index,
    load_exclusions,
)
from routers.scanner_match import load_aliases, load_persistent_links, match_plugin
from schemas.scanner import ScanPayload, ScannedPlugin, ScanSummary

router = APIRouter()


def _assign_status(confidence: str, disk_ver: str, record_ver: str | None, disk_paths: list | None = None) -> str:
    if confidence == "none":
        return "untracked"
    if confidence == "exact":
        if disk_ver != (record_ver or ""):
            return "conflicted"
        return "known" if disk_paths else "matched"
    return "unconfirmed"


async def _resolved_plugin_row(
    conn: Connection, scan_id: UUID, p: ScannedPlugin, target: tuple[str, str],
) -> tuple | None:
    """Row for a plugin resolved to a catalog record by a persistent link or a name alias.

    Both resolve with `confidence='exact'`; returns None if the target record is gone.
    """
    record_id, table = target
    if table not in CATALOG_TABLES:
        raise ValueError(f"resolved target has unknown record_table: {table!r}")
    pk, _ = CATALOG_TABLES[table]
    rec = await conn.fetchrow(f"SELECT version, disk_paths FROM {table} WHERE {pk}=$1", UUID(record_id))
    if rec is None:
        return None
    st = _assign_status("exact", p.version, rec["version"], rec["disk_paths"])
    return (scan_id, p.name, p.vendor, p.version, p.format, p.path,
            st, "exact", None, UUID(record_id), table, p.metadata_source)


def _unlinked_plugin_row(
    scan_id: UUID, p: ScannedPlugin,
    index: list[CatalogRecord], exclusions: set[str],
) -> tuple:
    _, result = match_plugin(p.name, p.vendor, index, exclusions)
    st = _assign_status(result.confidence, p.version,
                        result.record.version if result.record else None,
                        result.record.disk_paths if result.record else None)
    rec_id = UUID(result.record.record_id) if result.record else None
    rec_table = result.record.record_table if result.record else None
    return (scan_id, p.name, p.vendor, p.version, p.format, p.path,
            st, result.confidence, result.score, rec_id, rec_table, p.metadata_source)


@dataclass(frozen=True)
class _ScanCtx:
    """Per-scan resolution inputs, bundled so the per-plugin resolver stays ≤4 args."""
    scan_id: UUID
    links: dict[str, tuple[str, str]]
    aliases: dict[str, tuple[str, str]]
    exclusions: set[str]
    index: list[CatalogRecord]


async def _resolve_plugin_row(
    conn: Connection, p: ScannedPlugin, fp: str, sc: _ScanCtx,
) -> tuple | None:
    """Resolve one scanned plugin. Precedence: persistent link → name alias → exclusion → fuzzy."""
    if fp in sc.links:
        return await _resolved_plugin_row(conn, sc.scan_id, p, sc.links[fp])
    if p.name in sc.aliases:
        return await _resolved_plugin_row(conn, sc.scan_id, p, sc.aliases[p.name])
    if fp not in sc.exclusions:
        return _unlinked_plugin_row(sc.scan_id, p, sc.index, sc.exclusions)
    return None


@router.post("/scan")
async def ingest_scan(
    payload: ScanPayload,
    _label: Annotated[str, Depends(get_scanner_auth)],
    conn: Annotated[Connection, Depends(get_conn)],
) -> ScanSummary:
    index = await build_catalog_index(conn)
    exclusions = await load_exclusions(conn)
    links = await load_persistent_links(conn)
    aliases = await load_aliases(conn)

    async with conn.transaction():
        scan_id = await conn.fetchval(
            "INSERT INTO plugin_scans (source_machine, total_count) "
            "VALUES ($1, $2) RETURNING scan_id",
            payload.source_machine, len(payload.plugins),
        )
        sc = _ScanCtx(scan_id, links, aliases, exclusions, index)
        rows, seen = [], set()
        for p in payload.plugins:
            fp = f"{p.vendor} {p.name}".lower().strip()
            seen.add(fp)
            row = await _resolve_plugin_row(conn, p, fp, sc)
            if row is not None:
                rows.append(row)
        await conn.executemany(
            "INSERT INTO plugin_scan_results "
            "(scan_id,name,vendor,version,format,path,status,confidence,score,record_id,record_table,metadata_source)"
            " VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
            rows,
        )
        await insert_orphans(conn, scan_id, links, seen)

    counts = await conn.fetchrow(
        "SELECT "
        "COUNT(*) FILTER (WHERE status='known')                                 AS known,"
        "COUNT(*) FILTER (WHERE status IN ('untracked','unlinked'))             AS unlinked,"
        "COUNT(*) FILTER (WHERE status='orphaned')                              AS orphaned,"
        "COUNT(*) FILTER (WHERE status IN ('matched','unconfirmed','conflicted','needs_review')) AS needs_review,"
        "COUNT(*) FILTER (WHERE status IN ('ignored','excluded'))               AS excluded "
        "FROM plugin_scan_results WHERE scan_id=$1", scan_id,
    )
    return ScanSummary(scan_id=scan_id, **dict(counts))
