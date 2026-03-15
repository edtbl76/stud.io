#!/usr/bin/env python3
"""
STUD.io — Utility CSV Converter

Reads import/Studio 2026 - Utility.csv and dispatches rows by Sorted Category.

Current categories handled:
  - Composition Tools                    → csv/composition_tools.csv
  - Management Tools                     → csv/workflow_tools.csv
  - Metering & Signal + Spatial Tools    → csv/measurement_tools.csv
  - Reference Monitoring & Room Correction → csv/reference_tools.csv

Future categories (Reference Monitoring, Metering & Signal, etc.) can be added
as new handler functions in the dispatch table.

Usage:
    python convert_utility.py
"""

import csv
import re
import uuid
from pathlib import Path

BASE         = Path(__file__).parent.parent
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

# Explicit model_id overrides for import Model names whose lookup key doesn't
# match the (brand_cname + model_name) pattern used by build_model_map.
MODEL_REMAP = {
    "abbey road studios 3":          "eab3398f-fcbb-40b8-86f3-e7f2d0466ace",
    "mix la control room":           "daa4da14-30c8-4594-bc0e-fb7182bd02f1",
    "the hit factory (ny)":          "3d327a1c-d2db-4d93-864c-f7c11b9772e8",
    "ocean way studios (nashville)": "7062f522-fe80-4ba2-8f64-13440dfef129",
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

WORKFLOW_OUT_CSV  = BASE / "csv" / "workflow_tools.csv"
WORKFLOW_FIELDNAMES = [
    "workflow_tool_id", "brand_id", "tool_name", "version",
    "tool_types", "plugin_formats", "description", "workflow_notes", "tags",
]

MEASURE_OUT_CSV    = BASE / "csv" / "measurement_tools.csv"
REFERENCE_OUT_CSV  = BASE / "csv" / "reference_tools.csv"
REFERENCE_FIELDNAMES = [
    "reference_tool_id", "brand_id", "model_ids", "tool_name", "version",
    "tool_types", "plugin_formats", "description", "workflow_notes", "tags",
]
MODELS_CSV         = BASE / "csv" / "models.csv"
MEASURE_FIELDNAMES = [
    "measurement_tool_id", "brand_id", "model_ids", "tool_name", "version",
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
            for field in ("brand_name",):
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


def build_model_map():
    """Build (brand common_name + model_name).lower() → {model_id} map."""
    brand_names = {}
    with open(BRANDS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            bid   = clean(row.get("brand_id"))
            cname = clean(row.get("brand_name")) or clean(row.get("legal_name"))
            if bid and cname:
                brand_names[bid] = cname

    model_map = {}
    with open(MODELS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            model_id   = clean(row.get("model_id"))
            model_name = clean(row.get("model_name"))
            brand_id   = clean(row.get("brand_id"))
            if not model_id or not model_name:
                continue
            cname = brand_names.get(brand_id, "")
            if cname:
                full_name = normalize_model_key(cname + " " + model_name)
                model_map[full_name] = model_id
    return model_map


def normalize_model_key(name):
    """Strip apostrophes before digits for fuzzy matching (e.g. Fender '65 → Fender 65)."""
    return re.sub(r"'(\d)", r"\1", name).lower()


def lookup_models(model_str, model_map):
    """Return comma-separated model_ids for newline-separated model names."""
    if not model_str:
        return [], []
    model_ids     = []
    unmatched     = []
    for name in model_str.split("\n"):
        name = name.strip()
        if not name:
            continue
        mid = model_map.get(normalize_model_key(name))
        if mid:
            model_ids.append(mid)
        else:
            unmatched.append(name)
    return model_ids, unmatched


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


# ── Management Tools → workflow_tools ────────────────────────────────────────

def load_existing_workflow_tools():
    """Return (rows_list, {tool_name: workflow_tool_id}) from existing CSV."""
    rows   = []
    id_map = {}
    if not WORKFLOW_OUT_CSV.exists():
        return rows, id_map
    with open(WORKFLOW_OUT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = clean(row.get("tool_name"))
            tid  = clean(row.get("workflow_tool_id"))
            rows.append(row)
            if name and tid:
                id_map[name] = tid
    return rows, id_map


def handle_management_tools(import_rows, brand_map, existing_ids):
    """Convert Management Tools import rows → workflow_tools output dicts."""
    out_rows                = []
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
            "workflow_tool_id": existing_ids.get(name) or str(uuid.uuid4()),
            "brand_id":         brand_id,
            "tool_name":        name,
            "version":          version,
            "tool_types":       ",".join(tool_types_list),
            "plugin_formats":   ",".join(plugin_formats_list),
            "description":      notes,
            "workflow_notes":   "",
            "tags":             ",".join(tags_list),
        })

    return out_rows, unmatched_manufacturers


# ── Metering & Signal → measurement_tools ────────────────────────────────────

def load_existing_measurement_tools():
    """Return (rows_list, {tool_name: measurement_tool_id}) from existing CSV."""
    rows   = []
    id_map = {}
    if not MEASURE_OUT_CSV.exists():
        return rows, id_map
    with open(MEASURE_OUT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = clean(row.get("tool_name"))
            tid  = clean(row.get("measurement_tool_id"))
            rows.append(row)
            if name and tid:
                id_map[name] = tid
    return rows, id_map


def handle_metering_signal(import_rows, brand_map, model_map, existing_ids):
    """Convert Metering & Signal import rows → measurement_tools output dicts."""
    out_rows                = []
    unmatched_manufacturers = set()
    unmatched_models        = set()

    for row in import_rows:
        name         = clean(row.get("Name"))
        manufacturer = clean(row.get("Manufacturer"))
        version      = clean(row.get("Version"))
        form_factor  = clean(row.get("Form Factor"))
        fmt          = clean(row.get("Format"))
        notes        = clean(row.get("Notes"))
        tags_str     = clean(row.get("Tags"))
        model_str    = clean(row.get("Model"))

        if not name:
            continue

        brand_id = lookup_brand(manufacturer, brand_map)
        if manufacturer and not brand_id:
            unmatched_manufacturers.add(manufacturer)

        model_ids_list, unmatched = lookup_models(model_str, model_map)
        unmatched_models.update(unmatched)

        tool_types_list     = map_tool_types(form_factor)
        plugin_formats_list = map_plugin_formats(fmt)
        tags_list           = map_tags(tags_str)

        out_rows.append({
            "measurement_tool_id": existing_ids.get(name) or str(uuid.uuid4()),
            "brand_id":            brand_id,
            "model_ids":           ",".join(model_ids_list),
            "tool_name":           name,
            "version":             version,
            "tool_types":          ",".join(tool_types_list),
            "plugin_formats":      ",".join(plugin_formats_list),
            "description":         notes,
            "workflow_notes":      "",
            "tags":                ",".join(tags_list),
        })

    return out_rows, unmatched_manufacturers, unmatched_models


# ── Reference Monitoring & Room Correction → reference_tools ─────────────────

def load_existing_reference_tools():
    """Return (rows_list, {tool_name: reference_tool_id}) from existing CSV."""
    rows   = []
    id_map = {}
    if not REFERENCE_OUT_CSV.exists():
        return rows, id_map
    with open(REFERENCE_OUT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = clean(row.get("tool_name"))
            tid  = clean(row.get("reference_tool_id"))
            rows.append(row)
            if name and tid:
                id_map[name] = tid
    return rows, id_map


def handle_reference_monitoring(import_rows, brand_map, model_map, existing_ids):
    """Convert Reference Monitoring & Room Correction import rows → reference_tools output dicts."""
    out_rows                = []
    unmatched_manufacturers = set()
    unmatched_models        = set()

    for row in import_rows:
        name         = clean(row.get("Name"))
        manufacturer = clean(row.get("Manufacturer"))
        version      = clean(row.get("Version"))
        form_factor  = clean(row.get("Form Factor"))
        fmt          = clean(row.get("Format"))
        notes        = clean(row.get("Notes"))
        tags_str     = clean(row.get("Tags"))
        model_str    = clean(row.get("Model"))

        if not name:
            continue

        brand_id = lookup_brand(manufacturer, brand_map)
        if manufacturer and not brand_id:
            unmatched_manufacturers.add(manufacturer)

        model_ids_list, unmatched = lookup_models(model_str, model_map)
        unmatched_models.update(unmatched)

        tool_types_list     = map_tool_types(form_factor)
        plugin_formats_list = map_plugin_formats(fmt)
        tags_list           = map_tags(tags_str)

        out_rows.append({
            "reference_tool_id": existing_ids.get(name) or str(uuid.uuid4()),
            "brand_id":          brand_id,
            "model_ids":         ",".join(model_ids_list),
            "tool_name":         name,
            "version":           version,
            "tool_types":        ",".join(tool_types_list),
            "plugin_formats":    ",".join(plugin_formats_list),
            "description":       notes,
            "workflow_notes":    "",
            "tags":              ",".join(tags_list),
        })

    return out_rows, unmatched_manufacturers, unmatched_models


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  STUD.io — Utility CSV Converter")
    print("=" * 60)

    brand_map = build_brand_map()
    model_map = build_model_map()

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

    # ── Management Tools → workflow_tools ────────────────────────────────────
    wf_preserved, wf_existing_ids = load_existing_workflow_tools()
    if wf_preserved:
        print(f"\n  Loaded {len(wf_preserved)} existing workflow_tools rows (UUIDs preserved)")

    wf_import_rows, wf_unmatched = handle_management_tools(
        category_buckets.get("Management Tools", []),
        brand_map,
        wf_existing_ids,
    )

    wf_import_names = {r["tool_name"] for r in wf_import_rows}
    wf_merged = [r for r in wf_preserved if r.get("tool_name") not in wf_import_names]
    wf_merged.extend(wf_import_rows)

    with open(WORKFLOW_OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=WORKFLOW_FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(wf_merged)

    print(f"\n  {len(wf_merged)} workflow tools → {WORKFLOW_OUT_CSV.name}")

    if wf_unmatched:
        print(f"\n  Unmatched manufacturers ({len(wf_unmatched)}) — brand_id left blank:")
        for v in sorted(wf_unmatched):
            print(f"    - {v!r}")

    # ── Metering & Signal → measurement_tools ────────────────────────────────
    ms_preserved, ms_existing_ids = load_existing_measurement_tools()
    if ms_preserved:
        print(f"\n  Loaded {len(ms_preserved)} existing measurement_tools rows (UUIDs preserved)")

    ms_import_rows, ms_unmatched_mfr, ms_unmatched_models = handle_metering_signal(
        category_buckets.get("Metering & Signal", []) + category_buckets.get("Spatial Tools", []),
        brand_map,
        model_map,
        ms_existing_ids,
    )

    ms_import_names = {r["tool_name"] for r in ms_import_rows}
    ms_merged = [r for r in ms_preserved if r.get("tool_name") not in ms_import_names]
    ms_merged.extend(ms_import_rows)

    with open(MEASURE_OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=MEASURE_FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(ms_merged)

    print(f"\n  {len(ms_merged)} measurement tools → {MEASURE_OUT_CSV.name}")

    if ms_unmatched_mfr:
        print(f"\n  Unmatched manufacturers ({len(ms_unmatched_mfr)}) — brand_id left blank:")
        for v in sorted(ms_unmatched_mfr):
            print(f"    - {v!r}")

    if ms_unmatched_models:
        print(f"\n  Unmatched models ({len(ms_unmatched_models)}) — model_id left blank:")
        for v in sorted(ms_unmatched_models):
            print(f"    - {v!r}")

    # ── Reference Monitoring & Room Correction → reference_tools ─────────────
    ref_preserved, ref_existing_ids = load_existing_reference_tools()
    if ref_preserved:
        print(f"\n  Loaded {len(ref_preserved)} existing reference_tools rows (UUIDs preserved)")

    ref_import_rows, ref_unmatched_mfr, ref_unmatched_models = handle_reference_monitoring(
        category_buckets.get("Reference Monitoring & Room Correction", []),
        brand_map,
        model_map,
        ref_existing_ids,
    )

    ref_import_names = {r["tool_name"] for r in ref_import_rows}
    ref_merged = [r for r in ref_preserved if r.get("tool_name") not in ref_import_names]
    ref_merged.extend(ref_import_rows)

    with open(REFERENCE_OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=REFERENCE_FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(ref_merged)

    print(f"\n  {len(ref_merged)} reference tools → {REFERENCE_OUT_CSV.name}")

    if ref_unmatched_mfr:
        print(f"\n  Unmatched manufacturers ({len(ref_unmatched_mfr)}) — brand_id left blank:")
        for v in sorted(ref_unmatched_mfr):
            print(f"    - {v!r}")

    if ref_unmatched_models:
        print(f"\n  Unmatched models ({len(ref_unmatched_models)}) — model_id left blank:")
        for v in sorted(ref_unmatched_models):
            print(f"    - {v!r}")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
