"""Plugin Scanner — catalog index, DB loaders, and matching logic."""
from __future__ import annotations

from dataclasses import dataclass

from asyncpg import Connection
from rapidfuzz import fuzz

from routers.scanner_catalog import CatalogRecord

# ---------------------------------------------------------------------------
# Score thresholds (named constants — no magic numbers in match_plugin)
# ---------------------------------------------------------------------------

TIER2_HIGH   = 85.0
TIER2_MEDIUM = 65.0
TIER2_LOW    = 45.0
TIER3_LOW    = 65.0


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class MatchResult:
    confidence: str       # "exact" | "high" | "medium" | "low" | "none"
    score: float | None   # None for exact matches
    record: CatalogRecord | None


# ---------------------------------------------------------------------------
# DB loaders (accept asyncpg Connection)
# ---------------------------------------------------------------------------

async def load_persistent_links(conn: Connection) -> dict[str, tuple[str, str]]:
    rows = await conn.fetch(
        "SELECT fingerprint, record_id::text, record_table FROM scanner_plugin_links"
    )
    return {r["fingerprint"]: (str(r["record_id"]), r["record_table"]) for r in rows}


async def load_aliases(conn: Connection) -> dict[str, tuple[str, str]]:
    """Name aliases keyed on disk_name (U-14): {disk_name: (record_id, catalog_table)}."""
    rows = await conn.fetch(
        "SELECT disk_name, catalog_record_id::text, catalog_table FROM scanner_name_aliases"
    )
    return {r["disk_name"]: (str(r["catalog_record_id"]), r["catalog_table"]) for r in rows}


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
