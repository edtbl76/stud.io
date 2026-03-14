#!/usr/bin/env python3
"""
STUD.io — Utility CSV Converter

Reads import/Studio 2026 - Utility.csv and dispatches rows by Sorted Category.

Current categories handled:
  - Composition Tools → csv/composition_tools.csv

Future categories (Reference Monitoring, Metering & Signal, etc.) can be added
as new handler functions in the dispatch table.

Usage:
    python convert_utility.py
"""

import csv
import re
import uuid
from pathlib import Path

BASE         = Path(__file__).parent
IMPORT_CSV   = BASE / "import" / "Studio 2026 - Utility.csv"
BRANDS_CSV   = BASE / "csv" / "brands.csv"
COMP_OUT_CSV = BASE / "csv" / "composition_tools.csv"

VALID_TOOL_TYPES = {"Standalone", "Plugin", "Embedded"}
VALID_FORMATS    = {"AU", "VST3", "VST", "UAD-2", "UADx"}

# Explicit brand_id overrides for import Manufacturer names that don't normalize
# to a unique brands.csv entry via standard lookup.
VENDOR_REMAP = {
    "music developments": "6043e646-22d0-444e-b983-fec8a455ebb9",
}

TAG_MAP = {
    "Deprecated":    "Deprecated",
    "Hardware":      "Hardware",
    "Mastering":     "Mastering",
    "Restoration":   "Restoration",
    "Bass":          "Bass",
    "Drums":         "Drums",
    "FILTER OUT":    "Filter Out",
    "Guitar":        "Guitar",
    "Live Sound":    "Live Sound",
    "LOW DSP":       "Low DSP",
    "Modeled":       "Modeled",
    "REMOVE":        "Remove",
    "Stomp":         "Stomp",
    "Surround":      "Surround",
    "Voice":         "Voice",
    "Channel Strip": "Channel Strip",
}

COMP_FIELDNAMES = [
    "composition_tool_id", "brand_id", "tool_name", "version",
    "tool_types", "plugin_formats", "description", "workflow_notes", "tags",
]


# ── Shared utilities ─────────────────────────────────────────────────────────

def clean(val):
    if val is None:
        return ""
    v = str(val).strip()
    return v if v else ""


def normalize_vendor(v):
    """Strip parenthetical suffixes then lowercase. e.g. 'A/DA (Analog Digital Associates)' → 'a/da'."""
    return re.sub(r"\s*\(.*?\)\s*", "", v).strip().lower()


def build_brand_map():
    brand_map = {}
    with open(BRANDS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            brand_id = clean(row.get("brand_id"))
            if not brand_id:
                continue
            for field in ("common_name", "brand_name"):
                val = clean(row.get(field))
                if val:
                    brand_map[val.lower()] = brand_id
                    brand_map[normalize_vendor(val)] = brand_id
    return brand_map


def lookup_brand(vendor, brand_map):
    if not vendor:
        return ""
    raw  = vendor.strip().lower()
    norm = normalize_vendor(vendor)
    if raw in VENDOR_REMAP:
        return VENDOR_REMAP[raw]
    for key in (raw, norm):
        if key in brand_map:
            return brand_map[key]
    return ""


def map_tool_types(form_factor):
    """Map Form Factor string to tool_type list; blank Form Factor → ['Embedded']."""
    if not form_factor:
        return ["Embedded"]
    result = []
    seen   = set()
    for ff in form_factor.split(","):
        ff = ff.strip()
        if ff in VALID_TOOL_TYPES and ff not in seen:
            seen.add(ff)
            result.append(ff)
    return result


def map_plugin_formats(fmt_str):
    result = []
    seen   = set()
    for fmtv in fmt_str.split(","):
        fmtv = fmtv.strip()
        if fmtv in VALID_FORMATS and fmtv not in seen:
            seen.add(fmtv)
            result.append(fmtv)
    return result


def map_tags(tags_str):
    if not tags_str:
        return []
    result = []
    seen   = set()
    for t in tags_str.split(","):
        t      = t.strip()
        mapped = TAG_MAP.get(t)
        if mapped and mapped not in seen:
            seen.add(mapped)
            result.append(mapped)
    return result


# ── Composition Tools ─────────────────────────────────────────────────────────

def load_existing_composition_tools():
    """Return (rows_list, {tool_name: composition_tool_id}) from existing CSV."""
    rows     = []
    id_map   = {}
    if not COMP_OUT_CSV.exists():
        return rows, id_map
    with open(COMP_OUT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = clean(row.get("tool_name"))
            tid  = clean(row.get("composition_tool_id"))
            rows.append(row)
            if name and tid:
                id_map[name] = tid
    return rows, id_map


def handle_composition_tools(import_rows, brand_map, existing_ids):
    """Convert Composition Tools import rows → output dicts."""
    out_rows              = []
    unmatched_manufacturers = set()

    for row in import_rows:
        name         = clean(row.get("Name"))
        manufacturer = clean(row.get("Manufacturer"))
        version      = clean(row.get("Version"))
        form_factor  = clean(row.get("Form Factor"))
        fmt          = clean(row.get("Format"))
        notes        = clean(row.get("Notes"))
        tags_str     = clean(row.get("Tags"))

        if not name:
            continue

        brand_id = lookup_brand(manufacturer, brand_map)
        if manufacturer and not brand_id:
            unmatched_manufacturers.add(manufacturer)

        tool_types_list     = map_tool_types(form_factor)
        plugin_formats_list = map_plugin_formats(fmt)
        tags_list           = map_tags(tags_str)

        out_rows.append({
            "composition_tool_id": existing_ids.get(name) or str(uuid.uuid4()),
            "brand_id":            brand_id,
            "tool_name":           name,
            "version":             version,
            "tool_types":          ",".join(tool_types_list),
            "plugin_formats":      ",".join(plugin_formats_list),
            "description":         notes,
            "workflow_notes":      "",
            "tags":                ",".join(tags_list),
        })

    return out_rows, unmatched_manufacturers


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  STUD.io — Utility CSV Converter")
    print("=" * 60)

    brand_map = build_brand_map()

    # ── Composition Tools ────────────────────────────────────────────────────
    preserved_rows, existing_ids = load_existing_composition_tools()
    if preserved_rows:
        print(f"  Loaded {len(preserved_rows)} existing composition_tools rows (UUIDs preserved)")

    # Bucket import rows by Sorted Category
    category_buckets = {}
    with open(IMPORT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            cat = clean(row.get("Sorted Category"))
            category_buckets.setdefault(cat, []).append(row)

    comp_import_rows, unmatched_mfr = handle_composition_tools(
        category_buckets.get("Composition Tools", []),
        brand_map,
        existing_ids,
    )

    # Merge: hand-curated rows not present in the import + all import rows
    import_names = {r["tool_name"] for r in comp_import_rows}
    merged = [r for r in preserved_rows if r.get("tool_name") not in import_names]
    merged.extend(comp_import_rows)

    with open(COMP_OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COMP_FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(merged)

    print(f"\n  {len(merged)} composition tools → {COMP_OUT_CSV.name}")

    if unmatched_mfr:
        print(f"\n  Unmatched manufacturers ({len(unmatched_mfr)}) — brand_id left blank:")
        for v in sorted(unmatched_mfr):
            print(f"    - {v!r}")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
