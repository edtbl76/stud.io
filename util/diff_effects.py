#!/usr/bin/env python3
"""
Diff csv/effects.csv vs import/Studio 2026 - Effects.csv field-by-field.
Matches on (manufacturer_normalized, effect_name) to handle duplicate names.
"""

import csv
import re
from collections import Counter, defaultdict
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
            bname = clean(row.get("brand_name"))
            if bid and bname:
                m[bid] = normalize_vendor(bname)
    return m


def build_model_maps():
    """Mirrors convert_effects.py — full_model_name.lower() → {model_id, model_types}."""
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
            for field in ("brand_name",):
                val = clean(row.get(field))
                if val:
                    m[val.lower()] = bid
                    m[normalize_vendor(val)] = bid
    return m


def row_fingerprint(version, collection, description, workflow_notes, recording_notes, tags):
    """Tuple of all compared fields — used for set-cancellation matching."""
    return (version, collection, description, workflow_notes, recording_notes, tags)


def main():
    brand_name_map = build_brand_name_map()
    brand_lookup   = build_brand_lookup()
    model_map      = build_model_maps()

    # Group output rows by (vendor, effect_name) → Counter of fingerprints
    out_groups = defaultdict(Counter)
    with open(OUT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name     = clean(row.get("effect_name"))
            brand_id = clean(row.get("brand_id"))
            vendor   = brand_name_map.get(brand_id, "")
            if not name:
                continue
            fp = row_fingerprint(
                clean(row.get("version")),
                clean(row.get("collection")),
                clean(row.get("description")),
                clean(row.get("workflow_notes")),
                clean(row.get("recording_notes")),
                sorted_csv(row.get("tags", "")),
            )
            out_groups[(vendor, name)][fp] += 1

    # Group import rows by (vendor, effect_name) → Counter of fingerprints
    imp_groups  = defaultdict(Counter)
    imp_counts  = Counter()   # total import rows per (vendor, name)
    only_in_import = []

    with open(IMPORT_CSV, newline="", encoding="utf-8") as f:
        for imp_row in csv.DictReader(f):
            name_raw = clean(imp_row.get("Name"))
            if not name_raw:
                continue

            manufacturer = clean(imp_row.get("Manufacturer", ""))
            vendor_norm  = normalize_vendor(manufacturer)
            imp_brand_id = ""
            for key in (manufacturer.lower(), vendor_norm):
                if key in brand_lookup:
                    imp_brand_id = brand_lookup[key]
                    break
            imp_vendor = brand_name_map.get(imp_brand_id, vendor_norm)

            names = [n.strip() for n in name_raw.split("\n") if n.strip()]
            for effect_name in names:
                group_key = (imp_vendor, effect_name)
                if group_key not in out_groups:
                    only_in_import.append(f"{imp_vendor} / {effect_name}")
                    continue
                fp = row_fingerprint(
                    clean(imp_row.get("Version")),
                    clean(imp_row.get("Series / Collection")),
                    clean(imp_row.get("Plugin Notes")),
                    clean(imp_row.get("Workflow Notes")),
                    clean(imp_row.get("Recording Notes")),
                    map_tags(clean(imp_row.get("Tags", ""))),
                )
                imp_groups[group_key][fp] += 1
                imp_counts[group_key] += 1

    # Cancel identical rows; collect remaining drift
    diffs = []
    for group_key in sorted(imp_groups.keys()):
        vendor, effect_name = group_key
        imp_counter = Counter(imp_groups[group_key])
        out_counter = Counter(out_groups[group_key])

        # Cancel exact matches
        for fp in list(imp_counter.keys()):
            cancel = min(imp_counter[fp], out_counter[fp])
            imp_counter[fp] -= cancel
            out_counter[fp]  -= cancel

        remaining_imp = [(fp, n) for fp, n in imp_counter.items() if n > 0]
        remaining_out = [(fp, n) for fp, n in out_counter.items() if n > 0]

        if remaining_imp or remaining_out:
            diffs.append((vendor, effect_name, remaining_imp, remaining_out))

    # Output
    print(f"{'='*60}")
    print(f"  Effects Diff: import vs csv  (set-cancellation)")
    print(f"{'='*60}\n")

    FIELDS = ["version", "collection", "description", "workflow_notes", "recording_notes", "tags"]

    if diffs:
        total_imp = sum(sum(n for _, n in ri) for _, _, ri, _ in diffs)
        total_out = sum(sum(n for _, n in ro) for _, _, _, ro in diffs)
        print(f"  {len(diffs)} effect(s) with drift  "
              f"({total_imp} unmatched import rows, {total_out} unmatched output rows):\n")
        for vendor, effect_name, remaining_imp, remaining_out in diffs:
            print(f"  [{vendor} / {effect_name}]")
            if remaining_imp:
                for fp, n in remaining_imp:
                    label = f"  import{'  (×'+str(n)+')' if n > 1 else ''}"
                    print(f"    {label}:")
                    for field, val in zip(FIELDS, fp):
                        if val:
                            print(f"      {field}: {val!r}")
            if remaining_out:
                for fp, n in remaining_out:
                    label = f"  output{'  (×'+str(n)+')' if n > 1 else ''}"
                    print(f"    {label}:")
                    for field, val in zip(FIELDS, fp):
                        if val:
                            print(f"      {field}: {val!r}")
            print()
    else:
        print("  No field differences — effects.csv is in sync.\n")

    if only_in_import:
        print(f"  Only in import ({len(only_in_import)}):")
        for n in only_in_import:
            print(f"    - {n!r}")
        print()

    print(f"{'='*60}")


if __name__ == "__main__":
    main()
