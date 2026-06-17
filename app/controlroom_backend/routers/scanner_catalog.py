"""Plugin Scanner — shared catalog-data layer.

Lowest layer of the scanner backend (U-07). Owns *catalog data* concerns: which
tables form the catalog, how they are queried, and how a connection is turned
into the inputs matching needs (index, exclusions, rejections, meta).

INVARIANT (BR-U07-07): this module imports nothing from sibling ``scanner_*``
router modules. The dependency direction is strictly ``scanner_catalog`` ←
``scanner_match`` ← routers. Keeping it acyclic is what lets the matching-context
factory live below the matching algorithm without an import cycle.
"""
from __future__ import annotations

from dataclasses import dataclass

from asyncpg import Connection

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

# ---------------------------------------------------------------------------
# Catalog UNION builder
#
# Column templates use {pk}/{tbl}/{name} placeholders substituted per table.
# Variants 1/3/4 share _INDEX_COLS and differ only in the WHERE clause; the
# meta variant uses record_* aliases; the search variant omits disk_paths.
# ---------------------------------------------------------------------------

_DEFAULT_WHERE = "t.deleted_at IS NULL"

_INDEX_COLS = (
    "{pk}::text AS record_id, '{tbl}' AS record_table, "
    "{name} AS name, b.brand_name AS vendor, t.version, t.disk_paths"
)
_META_COLS = (
    "{pk}::text AS record_id, '{tbl}' AS record_table, "
    "{name} AS record_name, b.brand_name AS record_vendor, t.version AS record_version, t.disk_paths"
)
_SEARCH_COLS = (
    "{pk}::text AS record_id, '{tbl}' AS record_table, "
    "{name} AS name, b.brand_name AS vendor, t.version"
)


def catalog_union(cols: str, where: str = _DEFAULT_WHERE) -> str:
    """Build a ``UNION ALL`` over CATALOG_TABLES.

    ``cols`` is a column template with {pk}/{tbl}/{name} placeholders; ``where``
    is the shared filter applied to every branch.
    """
    return " UNION ALL ".join(
        f"SELECT {cols.format(pk=pk, tbl=tbl, name=name)} "
        f"FROM {tbl} t LEFT JOIN brands b ON t.brand_id = b.brand_id "
        f"WHERE {where}"
        for tbl, (pk, name) in CATALOG_TABLES.items()
    )


def catalog_index_query() -> str:
    """Full matching index (replaces scanner_match._CATALOG_UNION)."""
    return catalog_union(_INDEX_COLS)


def catalog_meta_query() -> str:
    """Catalog metadata with record_* aliases (replaces scanner_workbench._CATALOG_NAME_QUERY)."""
    return catalog_union(_META_COLS)


def orphaned_query() -> str:
    """Catalog rows with non-empty disk_paths (replaces scanner_links._ORPHANED_QUERY)."""
    return catalog_union(_INDEX_COLS, where=f"{_DEFAULT_WHERE} AND jsonb_array_length(t.disk_paths) > 0")


def absent_query() -> str:
    """Catalog rows whose disk_paths is not empty (replaces scanner._ABSENT_UNION)."""
    return catalog_union(_INDEX_COLS, where=f"{_DEFAULT_WHERE} AND t.disk_paths != '[]'::jsonb")


def catalog_search_query() -> str:
    """Catalog search projection without disk_paths (replaces scanner._CATALOG_SEARCH_UNION)."""
    return catalog_union(_SEARCH_COLS)


# ---------------------------------------------------------------------------
# Catalog records + DB loaders (accept asyncpg Connection)
# ---------------------------------------------------------------------------

@dataclass
class CatalogRecord:
    record_id: str
    record_table: str
    name: str
    vendor: str | None
    version: str | None
    disk_paths: list[dict]
    search_key: str  # precomputed: f"{vendor or ''} {name or ''}".lower().strip()


async def build_catalog_index(conn: Connection) -> list[CatalogRecord]:
    rows = await conn.fetch(catalog_index_query())
    return [
        CatalogRecord(
            record_id=str(r["record_id"]),
            record_table=r["record_table"],
            name=r["name"] or "",
            vendor=r["vendor"],
            version=r["version"],
            disk_paths=r["disk_paths"] or [],
            search_key=f"{r['vendor'] or ''} {r['name'] or ''}".lower().strip(),
        )
        for r in rows
    ]


async def load_exclusions(conn: Connection) -> set[str]:
    rows = await conn.fetch(
        "SELECT vendor, name FROM scanner_exclusions"
    )
    return {f"{r['vendor']} {r['name']}".lower().strip() for r in rows}


async def load_rejection_set(
    conn: Connection, fingerprints: list[str] | None = None,
) -> set[tuple]:
    """Load (fingerprint, record_id) rejection pairs.

    Tri-state on ``fingerprints`` (BR-U07-03):
      * ``None``  → all rejections (one unscoped query)
      * ``[]``    → empty set, no query issued
      * ``[...]`` → scoped to the given fingerprints
    """
    if fingerprints is None:
        rows = await conn.fetch("SELECT fingerprint, record_id::text FROM scanner_rejections")
    elif not fingerprints:
        return set()
    else:
        rows = await conn.fetch(
            "SELECT fingerprint, record_id::text FROM scanner_rejections WHERE fingerprint = ANY($1::text[])",
            fingerprints,
        )
    return {(r["fingerprint"], r["record_id"]) for r in rows}


# ---------------------------------------------------------------------------
# Clean-match check (generic matching concern)
# ---------------------------------------------------------------------------

def _norm(s: str | None) -> str:
    return (s or "").lower()


def is_clean_match(display_name, display_vendor, version, record) -> bool:
    """True when display name/vendor/version match the catalog record exactly.

    Name and vendor compare case-insensitively; version compares with None/""
    coalesced so a missing version equals an empty one.
    """
    name_ok = _norm(display_name) == _norm(record.name)
    vendor_ok = _norm(display_vendor) == _norm(record.vendor)
    version_ok = (version or "") == (record.version or "")
    return name_ok and vendor_ok and version_ok


# ---------------------------------------------------------------------------
# Matching context — unified bundle of the inputs matching needs
# Replaces scanner_workbench._WorkbenchCtx and scanner_rules._CatalogCtx.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class MatchingContext:
    catalog_index: list[CatalogRecord]
    exclusions: set[str]
    rejection_set: set[tuple]
    catalog_meta: dict[str, dict] | None = None


async def _fetch_catalog_meta(conn: Connection) -> dict[str, dict]:
    rows = await conn.fetch(catalog_meta_query())
    return {
        str(r["record_id"]): {
            "record_name": r["record_name"],
            "record_vendor": r["record_vendor"],
            "record_version": r["record_version"],
            "disk_paths": r["disk_paths"] or [],
        }
        for r in rows
    }


async def build_matching_context(
    conn: Connection, *, with_meta: bool = False, fingerprints: list[str] | None = None,
) -> MatchingContext:
    """Assemble a MatchingContext from a connection.

    ``with_meta`` loads catalog metadata only when requested (workbench path);
    ``fingerprints`` scopes the rejection set per the tri-state in
    :func:`load_rejection_set`.
    """
    return MatchingContext(
        catalog_index=await build_catalog_index(conn),
        exclusions=await load_exclusions(conn),
        rejection_set=await load_rejection_set(conn, fingerprints),
        catalog_meta=(await _fetch_catalog_meta(conn)) if with_meta else None,
    )
