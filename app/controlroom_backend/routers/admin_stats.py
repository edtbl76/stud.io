from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from database import get_conn
from routers.auth import require_admin, UserOut

router = APIRouter()


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


# Table names below are hardcoded constants — they must never be sourced from
# external input. The `users` table is intentionally excluded; user counts belong
# on the Users page, not the catalog stats page.
# (display_name, table_name, has_soft_delete, active_filter)
_STATS_GROUPS: list[tuple[str, list[tuple[str, str, bool, str | None]]]] = [
    ("Catalog", [
        ("Brands",  "brands",  True,  None),
        ("Models",  "models",  True,  None),
    ]),
    ("Session", [
        ("Effects",      "effects",      True, None),
        ("Instruments",  "instruments",  True, None),
        ("Libraries",    "libraries",    True, None),
        ("Workstations", "workstations", True, None),
    ]),
    ("Tools", [
        ("Admin",       "admin_tools",       True, None),
        ("Composition", "composition_tools", True, None),
        ("Measurement", "measurement_tools", True, None),
        ("Reference",   "reference_tools",   True, None),
        ("Workflow",    "workflow_tools",    True, None),
    ]),
    ("Config", [
        ("Effect Types",      "effect_types",     True, None),
        ("Entity Types",      "entity_types",     True, None),
        ("Instrument Types",  "instrument_types", True, None),
        ("Model Types",       "model_types",      True, None),
        ("Plugin Formats",    "plugin_formats",   True, None),
        ("Tag Types",         "tag_types",        True, None),
        ("Tool Types",        "tool_types",       True, None),
    ]),
    ("GearList", [
        ("Gear",       "gear",       True, None),
        ("Gear Types", "gear_types", True, None),
    ]),
    ("Scanner", [
        ("Scans",        "plugin_scans",         False, None),
        ("Scan Results", "plugin_scan_results",  False, None),
        ("API Keys",     "scanner_api_keys",     False, "revoked_at IS NULL"),
        ("Exclusions",   "scanner_exclusions",   False, None),
        ("Plugin Links", "scanner_plugin_links", False, None),
    ]),
]


async def _fetch_table_stat(
    conn: asyncpg.Connection,
    display_name: str,
    table_name: str,
    has_soft_delete: bool,
    active_filter: str | None = None,
) -> TableStat:
    """Fetch active row count and pending audit counts for a single table."""
    if has_soft_delete:
        row = await conn.fetchrow(
            f"SELECT COUNT(*)::int AS cnt FROM {table_name} WHERE deleted_at IS NULL"  # safe: table_name from _STATS_GROUPS constant
        )
    elif active_filter:
        row = await conn.fetchrow(
            f"SELECT COUNT(*)::int AS cnt FROM {table_name} WHERE {active_filter}"  # safe: table_name and active_filter from _STATS_GROUPS constant
        )
    else:
        row = await conn.fetchrow(
            f"SELECT COUNT(*)::int AS cnt FROM {table_name}"  # safe: table_name from _STATS_GROUPS constant
        )
    active_count = row["cnt"]

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

    return TableStat(
        name=display_name,
        count=adjusted_count,
        pending_creates=pending_creates,
        pending_deletes=pending_deletes,
        pending_updates=pending_updates,
    )


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
        for display_name, table_name, has_soft_delete, active_filter in table_triples:
            stat = await _fetch_table_stat(conn, display_name, table_name, has_soft_delete, active_filter)
            table_stats.append(stat)
            total += stat.count

        table_stats.sort(key=lambda t: (-t.count, t.name))
        groups.append(StatGroup(label=label, tables=table_stats))

    return StatsResponse(groups=groups, total=total)
