#!/usr/bin/env python3
"""
STUD.io — Instruments CSV Converter

Reads import/Studio 2026 - Instruments.csv and generates csv/instruments.csv,
mapping Manufacturer → brand_id, Category → instrument_types, Model → model_ids.

Multi-name rows (Name contains newline) are split into separate rows, each
with a distinct instrument_id.

Usage:
    python convert_instruments.py
"""

import csv
import re
import uuid
from pathlib import Path

BASE        = Path(__file__).parent.parent
IMPORT_CSV  = BASE / "import" / "Studio 2026 - Instruments.csv"
BRANDS_CSV  = BASE / "csv" / "brands.csv"
MODELS_CSV  = BASE / "csv" / "models.csv"
OUT_CSV     = BASE / "csv" / "instruments.csv"

VALID_INSTRUMENT_TYPES = {
    'Bass', 'Brass', 'Container', 'Drums & Percussion', 'Guitars',
    'Keyboards', 'Pads & Textures', 'Pipes', 'Rhythm', 'Sampling',
    'Sound Design', 'Strings', 'Synth', 'Vocal', 'Woodwinds', 'World Instruments',
}

VALID_TOOL_TYPES    = {"Plugin", "Standalone"}
VALID_PLUGIN_FMTS   = {"AU", "VST3", "VST", "UAD-2", "UADx"}

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


def clean(val):
    if val is None:
        return ""
    v = str(val).strip().replace("\r\n", "\n").replace("\r", "\n")
    return v if v else ""


def normalize_vendor(v):
    """Strip parenthetical suffixes, e.g. 'A/DA (Analog Digital Associates)' → 'a/da'."""
    return re.sub(r"\s*\(.*?\)\s*", "", v).strip().lower()


def build_brand_map():
    brand_map = {}
    with open(BRANDS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            brand_id = clean(row.get("brand_id"))
            if not brand_id:
                continue
            val = clean(row.get("brand_name"))
            if val:
                brand_map[val.lower()] = brand_id
                brand_map[normalize_vendor(val)] = brand_id
    return brand_map


def lookup_brand(vendor, brand_map):
    if not vendor:
        return ""
    for key in (vendor.strip().lower(), normalize_vendor(vendor)):
        if key in brand_map:
            return brand_map[key]
    return ""


def build_model_map():
    """full_model_name.lower() → {model_id, model_types}."""
    brand_names = {}
    with open(BRANDS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            bid   = clean(row.get("brand_id"))
            cname = clean(row.get("brand_name"))
            if bid and cname:
                brand_names[bid] = cname

    model_map = {}
    with open(MODELS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            model_id    = clean(row.get("model_id"))
            model_name  = clean(row.get("model_name"))
            brand_id    = clean(row.get("brand_id"))
            model_types = clean(row.get("model_types"))
            if not model_id or not model_name:
                continue
            cname = brand_names.get(brand_id, "")
            if cname:
                full_name = normalize_model_key(cname + " " + model_name)
                model_map[full_name] = {"model_id": model_id, "model_types": model_types}
    return model_map


def normalize_model_key(name):
    return re.sub(r"'(\d)", r"\1", name).strip().lower()


def lookup_models(model_str, model_map):
    """Return (model_ids_list, combined_model_types_str) for newline-separated model names."""
    if not model_str:
        return [], ""
    model_ids  = []
    types_seen = set()
    types_list = []
    for name in model_str.split("\n"):
        name  = name.strip()
        if not name:
            continue
        entry = model_map.get(normalize_model_key(name))
        if entry:
            model_ids.append(entry["model_id"])
            for mt in entry["model_types"].split(","):
                mt = mt.strip()
                if mt and mt not in types_seen:
                    types_seen.add(mt)
                    types_list.append(mt)
    return model_ids, ",".join(types_list)


def map_instrument_types(category_str):
    if not category_str:
        return []
    result = []
    seen   = set()
    for part in category_str.split(","):
        part = part.strip()
        if part in VALID_INSTRUMENT_TYPES and part not in seen:
            seen.add(part)
            result.append(part)
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


def load_existing(path):
    """Load existing instruments.csv keyed by (instrument_name, brand_id, sorted_model_ids) → {instrument_id, attributes}."""
    existing = {}
    if not path.exists():
        return existing
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name      = clean(row.get("instrument_name"))
            brand_id  = clean(row.get("brand_id"))
            model_ids = ",".join(sorted(clean(row.get("model_ids", "")).split(",")))
            if name:
                existing[(name, brand_id, model_ids)] = {
                    "instrument_id": clean(row.get("instrument_id")),
                    "attributes":    clean(row.get("attributes")),
                }
    return existing


def build_parent_map(sources):
    """Build name → 'table_name:id' from a list of (table_name, csv_path, name_field, id_field)."""
    parent_map = {}
    for table_name, csv_path, name_field, id_field in sources:
        if not csv_path.exists():
            continue
        with open(csv_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                name = clean(row.get(name_field))
                pid  = clean(row.get(id_field))
                if name and pid:
                    parent_map[name] = f"{table_name}:{pid}"
    return parent_map


def resolve_parents(parent_str, parent_map):
    """Resolve comma-separated parent names to 'table:id' entries."""
    if not parent_str:
        return ""
    result = []
    seen   = set()
    for part in parent_str.split(","):
        part = part.strip()
        if not part:
            continue
        ref = parent_map.get(part)
        if ref and ref not in seen:
            seen.add(ref)
            result.append(ref)
    return ",".join(result)


def main():
    print("=" * 60)
    print("  STUD.io — Instruments CSV Converter")
    print("=" * 60)

    brand_map  = build_brand_map()
    model_map  = build_model_map()
    existing   = load_existing(OUT_CSV)
    parent_map = build_parent_map([
        ("instruments", OUT_CSV,                            "instrument_name", "instrument_id"),
        ("workstations", BASE / "csv" / "workstations.csv", "tool_name",       "workstation_id"),
    ])
    if existing:
        print(f"  Preserving {len(existing)} existing rows (UUIDs + attributes)")

    rows                    = []
    unmatched_manufacturers = set()
    unmatched_models        = set()
    unknown_types           = set()

    with open(IMPORT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name_raw = clean(row.get("Name"))
            if not name_raw:
                continue

            names = [n.strip() for n in name_raw.split("\n") if n.strip()]

            manufacturer     = clean(row.get("Manufacturer"))
            category         = clean(row.get("Category"))
            model_str        = clean(row.get("Model"))
            tags_str         = clean(row.get("Tags"))
            version          = clean(row.get("Version"))
            form_factor      = clean(row.get("Form Factor"))
            fmt              = clean(row.get("Format"))
            plugin_notes     = clean(row.get("Plugin Notes"))
            instrument_notes = clean(row.get("Instrument Notes"))
            recording_notes  = clean(row.get("Recording Notes"))
            parent_str       = clean(row.get("Parent"))

            brand_id = lookup_brand(manufacturer, brand_map)
            if manufacturer and not brand_id:
                unmatched_manufacturers.add(manufacturer)

            model_ids_list, _ = lookup_models(model_str, model_map)
            if model_str and not model_ids_list:
                for name in model_str.split("\n"):
                    name = name.strip()
                    if name:
                        unmatched_models.add(name)

            instrument_types_list = map_instrument_types(category)

            # Flag unknown category segments
            if category:
                for part in category.split(","):
                    part = part.strip()
                    if part and part not in VALID_INSTRUMENT_TYPES:
                        unknown_types.add(part)

            tool_types_list = []
            for ff in form_factor.split(","):
                ff = ff.strip()
                if ff in VALID_TOOL_TYPES:
                    tool_types_list.append(ff)

            plugin_formats_list = []
            for fmtv in fmt.split(","):
                fmtv = fmtv.strip()
                if fmtv in VALID_PLUGIN_FMTS:
                    plugin_formats_list.append(fmtv)

            tags_list = map_tags(tags_str)

            parent_ids       = resolve_parents(parent_str, parent_map)
            model_ids_sorted = ",".join(sorted(model_ids_list))
            for instrument_name in names:
                prior = existing.get((instrument_name, brand_id, model_ids_sorted), {})
                rows.append({
                    "instrument_id":    prior.get("instrument_id") or str(uuid.uuid4()),
                    "brand_id":         brand_id,
                    "model_ids":        ",".join(model_ids_list),
                    "instrument_name":  instrument_name,
                    "version":          version,
                    "instrument_types": ",".join(instrument_types_list),
                    "tool_types":       ",".join(tool_types_list),
                    "plugin_formats":   ",".join(plugin_formats_list),
                    "description":      plugin_notes,
                    "instrument_notes": instrument_notes,
                    "recording_notes":  recording_notes,
                    "tags":             ",".join(tags_list),
                    "attributes":       prior.get("attributes") or "",
                    "parent_ids":       parent_ids,
                })

    fieldnames = [
        "instrument_id", "brand_id", "model_ids", "instrument_name", "version",
        "instrument_types", "tool_types", "plugin_formats",
        "description", "instrument_notes", "recording_notes", "tags", "attributes", "parent_ids",
    ]
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n  {len(rows)} instruments → {OUT_CSV.name}")

    if unknown_types:
        print(f"\n  Unknown category types ({len(unknown_types)}) — review manually:")
        for t in sorted(unknown_types):
            print(f"    - {t!r}")

    if unmatched_manufacturers:
        print(f"\n  Unmatched manufacturers ({len(unmatched_manufacturers)}) — brand_id left blank:")
        for v in sorted(unmatched_manufacturers):
            print(f"    - {v!r}")

    if unmatched_models:
        print(f"\n  Unmatched models ({len(unmatched_models)}) — model_id left blank:")
        for v in sorted(unmatched_models)[:20]:
            print(f"    - {v!r}")
        if len(unmatched_models) > 20:
            print(f"    ... and {len(unmatched_models) - 20} more")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
