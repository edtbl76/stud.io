#!/usr/bin/env python3
"""
STUD.io — Effects CSV Converter

Reads import/Studio 2026 - Effects.csv and generates csv/effects.csv,
mapping Manufacturer → brand_id, Category → effect_types, Model → model_id.

Multi-name rows (Name contains newline) are split into separate rows, each
with a distinct effect_id.

Usage:
    python convert_effects.py
"""

import csv
import re
import uuid
from pathlib import Path

BASE        = Path(__file__).parent.parent
IMPORT_CSV  = BASE / "import" / "Studio 2026 - Effects.csv"
BRANDS_CSV  = BASE / "csv" / "brands.csv"
MODELS_CSV  = BASE / "csv" / "models.csv"
OUT_CSV     = BASE / "csv" / "effects.csv"

# Map import Category segments → effect_type ENUM values
TYPE_REMAP = {
    "Reverb & Room":   ["Reverb&Room"],
    "Pitch":           ["Pitch Tools"],
    "Spatial Imaging": ["Spatial Processing"],
    "Preamps":         ["Preamp"],
    "Time / Phase":    ["Time/Phase"],
}

VALID_EFFECT_TYPES = {
    'Cabinet', 'Combo', 'Container', 'Delay',
    'Dynamics', 'EQ', 'Harmonic Coloration', 'Head', 'Microphone',
    'Modulation', 'Pitch Tools', 'Preamp', 'DI', 'Reverb&Room',
    'Spatial Processing', 'Time/Phase',
}

# model_type values that map to effect_types for Amp & Cab rows
AMP_CAB_TYPES = {'Head', 'Combo', 'Cabinet'}

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
    v = str(val).strip()
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
            for field in ("brand_name",):
                val = clean(row.get(field))
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
    """Build full_model_name.lower() → {model_id, model_types} by joining models + brands."""
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
            model_id    = clean(row.get("model_id"))
            model_name  = clean(row.get("model_name"))
            brand_id    = clean(row.get("brand_id"))
            model_types = clean(row.get("model_types"))
            if not model_id or not model_name:
                continue
            cname = brand_names.get(brand_id, "")
            if cname:
                full_name = (cname + " " + model_name).lower().strip()
                model_map[full_name] = {
                    "model_id":    model_id,
                    "model_types": model_types,
                }
    return model_map


def normalize_model_key(name):
    """Normalize a model lookup name for matching against the model_map."""
    # Strip apostrophes before digits (e.g. Fender '65 → Fender 65, Fulltone '70 → Fulltone 70)
    return re.sub(r"'(\d)", r"\1", name).lower()


def lookup_models(model_str, model_map):
    """Return (model_ids_list, combined_model_types_str) for newline-separated model names."""
    if not model_str:
        return [], ""
    model_ids   = []
    types_seen  = set()
    types_list  = []
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


def map_effect_types(category_str, model_types_str):
    """Map category string to list of effect_type ENUM values.

    'Amp & Cab' segments are resolved to Head/Combo/Cabinet via model_types.
    All other segments use TYPE_REMAP or direct VALID_EFFECT_TYPES match.
    """
    if not category_str:
        return []

    parts  = [p.strip() for p in category_str.split(",") if p.strip()]
    result = []
    seen   = set()

    for part in parts:
        if part == "Amp & Cab":
            if model_types_str:
                for mt in model_types_str.split(","):
                    mt = mt.strip()
                    if mt in AMP_CAB_TYPES and mt not in seen:
                        seen.add(mt)
                        result.append(mt)
        elif part in TYPE_REMAP:
            for t in TYPE_REMAP[part]:
                if t not in seen:
                    seen.add(t)
                    result.append(t)
        elif part in VALID_EFFECT_TYPES:
            if part not in seen:
                seen.add(part)
                result.append(part)

    return result


def map_tags(tags_str):
    """Map comma-separated import tags to tag_type ENUM values."""
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
    """Load existing effects.csv keyed by effect_name → {effect_id, brand_id, attributes}."""
    existing = {}
    if not path.exists():
        return existing
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = clean(row.get("effect_name"))
            if name:
                existing[name] = {
                    "effect_id":  clean(row.get("effect_id")),
                    "brand_id":   clean(row.get("brand_id")),
                    "attributes": clean(row.get("attributes")),
                }
    return existing


def main():
    print("=" * 60)
    print("  STUD.io — Effects CSV Converter")
    print("=" * 60)

    brand_map = build_brand_map()
    model_map = build_model_map()
    existing  = load_existing(OUT_CSV)
    if existing:
        print(f"  Preserving {len(existing)} existing rows (UUIDs + attributes + manual brand_ids)")

    rows                     = []
    unmatched_manufacturers  = set()
    unknown_types            = set()
    unmatched_models         = set()

    with open(IMPORT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name_raw = clean(row.get("Name"))
            if not name_raw:
                continue

            # Split multi-name rows on newline
            names = [n.strip() for n in name_raw.split("\n") if n.strip()]

            manufacturer    = clean(row.get("Manufacturer"))
            category        = clean(row.get("Category"))
            model_str       = clean(row.get("Model"))
            tags_str        = clean(row.get("Tags"))
            plugin_notes    = clean(row.get("Plugin Notes"))
            workflow_notes  = clean(row.get("Workflow Notes"))
            recording_notes = clean(row.get("Recording Notes"))
            collection      = clean(row.get("Series / Collection"))
            form_factor     = clean(row.get("Form Factor"))
            fmt             = clean(row.get("Format"))
            version         = clean(row.get("Version"))

            # Brand lookup
            brand_id = lookup_brand(manufacturer, brand_map)
            if manufacturer and not brand_id:
                unmatched_manufacturers.add(manufacturer)

            # Model lookup (may be multiple newline-separated names)
            model_ids_list, model_types_str = lookup_models(model_str, model_map)
            if model_str and not model_ids_list:
                for name in model_str.split("\n"):
                    name = name.strip()
                    if name:
                        unmatched_models.add(name)

            # Effect types from category
            effect_types_list = map_effect_types(category, model_types_str)

            # Flag unknown category segments
            if category:
                for part in category.split(","):
                    part = part.strip()
                    if (part and part != "Amp & Cab"
                            and part not in TYPE_REMAP
                            and part not in VALID_EFFECT_TYPES):
                        unknown_types.add(part)

            # Tool types
            tool_types_list = []
            for ff in form_factor.split(","):
                ff = ff.strip()
                if ff in ("Plugin", "Standalone"):
                    tool_types_list.append(ff)

            # Plugin formats
            valid_formats      = {"AU", "VST3", "VST", "UAD-2", "UADx"}
            plugin_formats_list = []
            for fmtv in fmt.split(","):
                fmtv = fmtv.strip()
                if fmtv in valid_formats:
                    plugin_formats_list.append(fmtv)

            # Tags
            tags_list = map_tags(tags_str)

            # One output row per name
            for effect_name in names:
                prior          = existing.get(effect_name, {})
                final_brand_id = prior.get("brand_id") or brand_id
                rows.append({
                    "effect_id":        prior.get("effect_id") or str(uuid.uuid4()),
                    "brand_id":         final_brand_id,
                    "model_ids":        ",".join(model_ids_list),
                    "effect_name":      effect_name,
                    "version":          version,
                    "collection":       collection,
                    "effect_types":     ",".join(effect_types_list),
                    "tool_types":       ",".join(tool_types_list),
                    "plugin_formats":   ",".join(plugin_formats_list),
                    "plugin_notes":     plugin_notes,
                    "workflow_notes":   workflow_notes,
                    "description":      "",
                    "recording_notes":  recording_notes,
                    "artist_reference": "",
                    "attributes":       prior.get("attributes") or "",
                    "tags":             ",".join(tags_list),
                })

    fieldnames = [
        "effect_id", "brand_id", "model_ids", "effect_name", "version",
        "collection", "effect_types", "tool_types", "plugin_formats", "plugin_notes",
        "workflow_notes", "description", "recording_notes", "artist_reference",
        "attributes", "tags",
    ]
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n  {len(rows)} effects → {OUT_CSV.name}")

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
