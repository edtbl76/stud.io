#!/usr/bin/env python3
"""
Diff csv/effects.csv vs import/Studio 2026 - Effects.csv field-by-field.
Matches on (manufacturer_normalized, effect_name) to handle duplicate names.
"""

import csv
import re
from pathlib import Path

BASE        = Path(__file__).parent.parent
IMPORT_CSV  = BASE / "import" / "Studio 2026 - Effects.csv"
OUT_CSV     = BASE / "csv" / "effects.csv"
BRANDS_CSV  = BASE / "csv" / "brands.csv"
MODELS_CSV  = BASE / "csv" / "models.csv"

# Mirrors convert_effects.py
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

AMP_CAB_TYPES = {'Head', 'Combo', 'Cabinet'}

VALID_TOOL_TYPES   = {"Plugin", "Standalone"}
VALID_PLUGIN_FMTS  = {"AU", "VST3", "VST", "UAD-2", "UADx"}


def clean(val):
    if val is None:
        return ""
    return str(val).strip().replace("\r\n", "\n").replace("\r", "\n")


def normalize_vendor(v):
    return re.sub(r"\s*\(.*?\)\s*", "", v).strip().lower()


def sorted_csv(val):
    """Normalize a comma-separated value by sorting its elements."""
    if not val:
        return ""
    parts = sorted(p.strip() for p in val.split(",") if p.strip())
    return ",".join(parts)


def map_tags(tags_str):
    if not tags_str:
        return ""
    result = []
    seen   = set()
    for t in tags_str.split(","):
        t      = t.strip()
        mapped = TAG_MAP.get(t)
        if mapped and mapped not in seen:
            seen.add(mapped)
            result.append(mapped)
    return ",".join(sorted(result))


def map_effect_types(category_str, model_types_str=""):
    if not category_str:
        return ""
    parts  = [p.strip() for p in category_str.split(",") if p.strip()]
    result = []
    seen   = set()
    for part in parts:
        if part == "Amp & Cab":
            for mt in (model_types_str or "").split(","):
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
    return ",".join(sorted(result))


def map_tool_types(form_factor_str):
    result = []
    for ff in (form_factor_str or "").split(","):
        ff = ff.strip()
        if ff in VALID_TOOL_TYPES:
            result.append(ff)
    return ",".join(sorted(result))


def map_plugin_formats(fmt_str):
    result = []
    for f in (fmt_str or "").split(","):
        f = f.strip()
        if f in VALID_PLUGIN_FMTS:
            result.append(f)
    return ",".join(sorted(result))


def build_brand_name_map():
    """brand_id → normalized brand name."""
    m = {}
    with open(BRANDS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            bid   = clean(row.get("brand_id"))
            bname = clean(row.get("brand_name")) or clean(row.get("legal_name"))
            if bid and bname:
                m[bid] = normalize_vendor(bname)
    return m


def build_model_maps():
    """Mirrors convert_effects.py — full_model_name.lower() → {model_id, model_types}."""
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
                model_map[full_name] = {"model_id": model_id, "model_types": model_types}
    return model_map


def normalize_model_key(name):
    return re.sub(r"'(\d)", r"\1", name).lower()


def lookup_models(model_str, model_map):
    """Return (sorted_model_ids_str, model_types_str)."""
    if not model_str:
        return "", ""
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
    return ",".join(sorted(model_ids)), ",".join(types_list)


def build_brand_lookup():
    """normalized vendor name → brand_id."""
    m = {}
    with open(BRANDS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            bid = clean(row.get("brand_id"))
            if not bid:
                continue
            for field in ("brand_name", "legal_name"):
                val = clean(row.get(field))
                if val:
                    m[val.lower()] = bid
                    m[normalize_vendor(val)] = bid
    return m


def main():
    brand_name_map = build_brand_name_map()
    brand_lookup   = build_brand_lookup()
    model_map      = build_model_maps()

    # Load output keyed by (vendor, effect_name, sorted_model_ids)
    out_rows = {}
    with open(OUT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name      = clean(row.get("effect_name"))
            brand_id  = clean(row.get("brand_id"))
            vendor    = brand_name_map.get(brand_id, "")
            model_ids = ",".join(sorted(clean(row.get("model_ids", "")).split(",")))
            if name:
                out_rows[(vendor, name, model_ids)] = row

    diffs          = []
    only_in_import = []
    only_in_output = set(out_rows.keys())

    with open(IMPORT_CSV, newline="", encoding="utf-8") as f:
        for imp_row in csv.DictReader(f):
            name_raw = clean(imp_row.get("Name"))
            if not name_raw:
                continue

            manufacturer = clean(imp_row.get("Manufacturer", ""))
            vendor_norm  = normalize_vendor(manufacturer)

            # Resolve brand_id for this import row
            imp_brand_id = ""
            for key in (manufacturer.lower(), vendor_norm):
                if key in brand_lookup:
                    imp_brand_id = brand_lookup[key]
                    break
            imp_vendor = brand_name_map.get(imp_brand_id, vendor_norm)

            # Resolve model_ids from import Model field
            model_str             = clean(imp_row.get("Model", ""))
            imp_model_ids_sorted, _ = lookup_models(model_str, model_map)

            # Multi-name rows are split on newline
            names = [n.strip() for n in name_raw.split("\n") if n.strip()]

            for effect_name in names:
                key = (imp_vendor, effect_name, imp_model_ids_sorted)

                if key in out_rows:
                    out = out_rows[key]
                else:
                    # Fall back to (vendor, name) ignoring model_ids
                    name_matches = [(v, n, m) for (v, n, m) in out_rows if v == imp_vendor and n == effect_name]
                    if not name_matches:
                        # Last resort: name-only
                        name_matches = [(v, n, m) for (v, n, m) in out_rows if n == effect_name]
                    if not name_matches:
                        only_in_import.append(f"{imp_vendor} / {effect_name}")
                        continue
                    out = out_rows[name_matches[0]]
                    key = name_matches[0]

                only_in_output.discard(key)

                exp_tags = map_tags(clean(imp_row.get("Tags", "")))

                field_diffs = []
                checks = [
                    ("version",        clean(imp_row.get("Version")),             clean(out.get("version"))),
                    ("collection",     clean(imp_row.get("Series / Collection")), clean(out.get("collection"))),
                    ("plugin_notes",   clean(imp_row.get("Plugin Notes")),        clean(out.get("plugin_notes"))),
                    ("workflow_notes", clean(imp_row.get("Workflow Notes")),       clean(out.get("workflow_notes"))),
                    ("recording_notes",clean(imp_row.get("Recording Notes")),      clean(out.get("recording_notes"))),
                    ("tags",           exp_tags,                                   sorted_csv(out.get("tags", ""))),
                ]
                for col, imp_val, out_val in checks:
                    if imp_val != out_val:
                        field_diffs.append((col, imp_val, out_val))

                if field_diffs:
                    diffs.append((imp_vendor, effect_name, field_diffs))

    print(f"{'='*60}")
    print(f"  Effects Diff: import vs csv")
    print(f"{'='*60}\n")

    if diffs:
        print(f"  {len(diffs)} rows with field differences:\n")
        for vendor, effect_name, field_diffs in diffs:
            print(f"  [{vendor} / {effect_name}]")
            for col, imp_val, out_val in field_diffs:
                print(f"    {col}:")
                print(f"      import: {imp_val!r}")
                print(f"      output: {out_val!r}")
            print()
    else:
        print("  No field differences — effects.csv is in sync.\n")

    if only_in_import:
        print(f"  Only in import ({len(only_in_import)}):")
        for n in only_in_import:
            print(f"    - {n!r}")
        print()

    if only_in_output:
        print(f"  Only in output ({len(only_in_output)}):")
        for (v, n) in sorted(only_in_output):
            print(f"    - {v} / {n!r}")
        print()

    print(f"{'='*60}")


if __name__ == "__main__":
    main()
