from typing import Annotated, NamedTuple

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


class TableConfig(NamedTuple):
    display_name: str
    table_name: str
    has_soft_delete: bool
    active_filter: str | None = None


# Table names below are hardcoded constants — they must never be sourced from
# external input. The `users` table is intentionally excluded; user counts belong
# on the Users page, not the catalog stats page.
_STATS_GROUPS: list[tuple[str, list[TableConfig]]] = [
    ("Catalog", [
        TableConfig("Brands",  "brands",  True),
        TableConfig("Models",  "models",  True),
    ]),
    ("Session", [
        TableConfig("Effects",      "effects",      True),
        TableConfig("Instruments",  "instruments",  True),
        TableConfig("Libraries",    "libraries",    True),
        TableConfig("Workstations", "workstations", True),
    ]),
    ("Tools", [
        TableConfig("Admin",       "admin_tools",       True),
        TableConfig("Composition", "composition_tools", True),
        TableConfig("Measurement", "measurement_tools", True),
        TableConfig("Reference",   "reference_tools",   True),
        TableConfig("Workflow",    "workflow_tools",    True),
    ]),
    ("Config", [
        TableConfig("Effect Types",      "effect_types",     True),
        TableConfig("Entity Types",      "entity_types",     True),
        TableConfig("Instrument Types",  "instrument_types", True),
        TableConfig("Model Types",       "model_types",      True),
        TableConfig("Plugin Formats",    "plugin_formats",   True),
        TableConfig("Tag Types",         "tag_types",        True),
        TableConfig("Tool Types",        "tool_types",       True),
    ]),
    ("GearList", [
        TableConfig("Gear",       "gear",       True),
        TableConfig("Gear Types", "gear_types", True),
    ]),
    # Scanner tables have no soft-delete column, so each is a plain COUNT(*)
    # (has_soft_delete=False, active_filter=None). scanner_api_keys is excluded —
    # credentials belong with Users, not the catalog stats page.
    ("Scanner", [
        TableConfig("Scans",         "plugin_scans",          False),
        TableConfig("Scan Results",  "plugin_scan_results",   False),
        TableConfig("Vendor Rules",  "scanner_vendor_rules",  False),
        TableConfig("Name Rules",    "scanner_name_rules",    False),
        TableConfig("Name Patterns", "scanner_name_patterns", False),
        TableConfig("Aliases",       "scanner_name_aliases",  False),
        TableConfig("Exclusions",    "scanner_exclusions",    False),
        TableConfig("Links",         "scanner_plugin_links",  False),
        TableConfig("Rejections",    "scanner_rejections",    False),
    ]),
]


async def _fetch_table_stat(conn: asyncpg.Connection, cfg: TableConfig) -> TableStat:
    """Fetch active row count and pending audit counts for a single table."""
    if cfg.has_soft_delete:
        row = await conn.fetchrow(
            f"SELECT COUNT(*)::int AS cnt FROM {cfg.table_name} WHERE deleted_at IS NULL"  # safe: table_name from _STATS_GROUPS constant
        )
    elif cfg.active_filter:
        row = await conn.fetchrow(
            f"SELECT COUNT(*)::int AS cnt FROM {cfg.table_name} WHERE {cfg.active_filter}"  # safe: table_name and active_filter from _STATS_GROUPS constant
        )
    else:
        row = await conn.fetchrow(
            f"SELECT COUNT(*)::int AS cnt FROM {cfg.table_name}"  # safe: table_name from _STATS_GROUPS constant
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
        cfg.table_name,
    )
    pending_creates = pending_row["creates"]
    pending_deletes = pending_row["deletes"]
    pending_updates = pending_row["updates"]
    adjusted_count = active_count - pending_creates + pending_deletes

    return TableStat(
        name=cfg.display_name,
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
        for cfg in table_triples:
            stat = await _fetch_table_stat(conn, cfg)
            table_stats.append(stat)
            total += stat.count

        table_stats.sort(key=lambda t: (-t.count, t.name))
        groups.append(StatGroup(label=label, tables=table_stats))

    return StatsResponse(groups=groups, total=total)
