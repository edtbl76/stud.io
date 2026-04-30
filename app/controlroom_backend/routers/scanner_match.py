"""Pure matching module for the Plugin Scanner.

No FastAPI or asyncpg imports — this module is testable in isolation.
All functions accept plain Python types and return plain dataclasses.
"""
from __future__ import annotations

from dataclasses import dataclass

from rapidfuzz import fuzz

# ---------------------------------------------------------------------------
# Score thresholds (named constants — no magic numbers in match_plugin)
# ---------------------------------------------------------------------------

TIER2_HIGH   = 85.0
TIER2_MEDIUM = 65.0
TIER2_LOW    = 45.0
TIER3_LOW    = 65.0

# ---------------------------------------------------------------------------
# Catalog tables included in the matching index
# Maps table name → (pk_column, name_column)
# ---------------------------------------------------------------------------

CATALOG_TABLES: dict[str, tuple[str, str]] = {
    "effects":           ("effect_id",          "effect_name"),
    "instruments":       ("instrument_id",       "instrument_name"),
    "workstations":      ("workstation_id",      "tool_name"),
    "workflow_tools":    ("workflow_tool_id",    "tool_name"),
    "measurement_tools": ("measurement_tool_id", "tool_name"),
    "reference_tools":   ("reference_tool_id",  "tool_name"),
    "composition_tools": ("composition_tool_id", "tool_name"),
    "admin_tools":       ("admin_tool_id",       "tool_name"),
}

_CATALOG_UNION = " UNION ALL ".join(
    f"SELECT {pk}::text AS record_id, '{tbl}' AS record_table, "
    f"{name} AS name, b.brand_name AS vendor, t.version "
    f"FROM {tbl} t LEFT JOIN brands b ON t.brand_id = b.brand_id "
    f"WHERE t.deleted_at IS NULL"
    for tbl, (pk, name) in CATALOG_TABLES.items()
)


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class CatalogRecord:
    record_id: str
    record_table: str
    name: str
    vendor: str | None
    version: str | None
    search_key: str  # precomputed: f"{vendor or ''} {name}".lower().strip()


@dataclass
class MatchResult:
    confidence: str       # "exact" | "high" | "medium" | "low" | "none"
    score: float | None   # None for exact matches
    record: CatalogRecord | None


# ---------------------------------------------------------------------------
# DB loaders (accept asyncpg Connection)
# ---------------------------------------------------------------------------

async def build_catalog_index(conn) -> list[CatalogRecord]:
    rows = await conn.fetch(_CATALOG_UNION)
    return [
        CatalogRecord(
            record_id=str(r["record_id"]),
            record_table=r["record_table"],
            name=r["name"] or "",
            vendor=r["vendor"],
            version=r["version"],
            search_key=f"{r['vendor'] or ''} {r['name'] or ''}".lower().strip(),
        )
        for r in rows
    ]


async def load_exclusions(conn) -> set[str]:
    rows = await conn.fetch(
        "SELECT vendor, name FROM scanner_exclusions"
    )
    return {f"{r['vendor']} {r['name']}".lower().strip() for r in rows}


async def load_persistent_links(conn) -> dict[str, tuple[str, str]]:
    rows = await conn.fetch(
        "SELECT fingerprint, record_id::text, record_table FROM scanner_plugin_links"
    )
    return {r["fingerprint"]: (str(r["record_id"]), r["record_table"]) for r in rows}


# ---------------------------------------------------------------------------
# Tier helpers (pure)
# ---------------------------------------------------------------------------

def _tier2_match(fingerprint: str, index: list[CatalogRecord]) -> MatchResult | None:
    if not index:
        return None
    best = max(index, key=lambda r: fuzz.token_sort_ratio(fingerprint, r.search_key))
    score = fuzz.token_sort_ratio(fingerprint, best.search_key)
    if score >= TIER2_HIGH:
        return MatchResult("high", score, best)
    if score >= TIER2_MEDIUM:
        return MatchResult("medium", score, best)
    if score >= TIER2_LOW:
        return MatchResult("low", score, best)
    return None


def _tier3_match(name: str, index: list[CatalogRecord]) -> MatchResult | None:
    if not index:
        return None
    name_key = name.lower().strip()
    best = max(index, key=lambda r: fuzz.token_sort_ratio(name_key, r.name.lower()))
    score = fuzz.token_sort_ratio(name_key, best.name.lower())
    if score >= TIER3_LOW:
        return MatchResult("low", score, best)
    return None


# ---------------------------------------------------------------------------
# Core matching function (pure — no I/O)
# ---------------------------------------------------------------------------

def match_plugin(
    name: str,
    vendor: str,
    index: list[CatalogRecord],
    exclusions: set[str],
) -> tuple[str, MatchResult]:
    """Return (fingerprint, MatchResult).

    Persistent links are resolved by the caller before this function is called.
    """
    fingerprint = f"{vendor} {name}".lower().strip()

    if fingerprint in exclusions:
        return fingerprint, MatchResult("none", None, None)

    for record in index:
        if record.search_key == fingerprint:
            return fingerprint, MatchResult("exact", None, record)

    result = _tier2_match(fingerprint, index) or _tier3_match(name, index)
    if result:
        return fingerprint, result

    return fingerprint, MatchResult("none", None, None)
