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
    """Derive the frozen five-bucket ingest status (U-08).

    Returns one of: known, needs_review, unlinked. (orphaned is set by the
    catalog-absence path; excluded only by user actions.) An exact,
    version-agreeing match is `known` only once reconciled (catalog has
    disk_paths); until then it is `needs_review` (Q1).
    """
    if confidence == "none":
        return "unlinked"
    if confidence != "exact":
        return "needs_review"
    versions_agree = disk_ver == (record_ver or "")
    if versions_agree and disk_paths:
        return "known"
    return "needs_review"


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


def _apply_collision_override(rows: list[tuple]) -> list[tuple]:
    """Downgrade `known` rows to `needs_review` when they collide (U-08, Q3).

    A collision is 2+ installs of the same (name, vendor, format) at distinct
    paths within the scan. The collision sub-state is not stored — only the
    coarse `needs_review` value.
    """
    paths_by_key: dict[tuple, set] = {}
    for r in rows:
        paths_by_key.setdefault((r[1], r[2], r[4]), set()).add(r[5])
    colliding = {k for k, paths in paths_by_key.items() if len(paths) >= 2}
    if not colliding:
        return rows
    return [
        r[:6] + ("needs_review",) + r[7:]
        if r[6] == "known" and (r[1], r[2], r[4]) in colliding else r
        for r in rows
    ]


async def _summary_counts(conn: Connection, scan_id: UUID) -> dict[str, int]:
    """Per-bucket counts over a scan's frozen five-value status snapshot."""
    counts = await conn.fetchrow(
        "SELECT "
        "COUNT(*) FILTER (WHERE status='known')        AS known,"
        "COUNT(*) FILTER (WHERE status='unlinked')     AS unlinked,"
        "COUNT(*) FILTER (WHERE status='orphaned')     AS orphaned,"
        "COUNT(*) FILTER (WHERE status='needs_review') AS needs_review,"
        "COUNT(*) FILTER (WHERE status='excluded')     AS excluded "
        "FROM plugin_scan_results WHERE scan_id=$1", scan_id,
    )
    return dict(counts)


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
            _apply_collision_override(rows),
        )
        await insert_orphans(conn, scan_id, links, seen)

    return ScanSummary(scan_id=scan_id, **await _summary_counts(conn, scan_id))
