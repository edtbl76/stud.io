#!/usr/bin/env python3
"""
STUD.io — Models CSV Converter  (one-time extraction)

Reads import/Studio 2026 - Models.csv and generates csv/models.csv,
mapping Vendor → brand_id and Type → model_types ENUM values.

Usage:
    python convert_models.py
"""

import csv
import re
import uuid
from pathlib import Path

BASE        = Path(__file__).parent.parent
IMPORT_CSV  = BASE / "import" / "Studio 2026 - Models.csv"
BRANDS_CSV  = BASE / "csv" / "brands.csv"
OUT_CSV     = BASE / "csv" / "models.csv"

# If any type segment contains this string, leave model_types blank
BLANK_IF_CONTAINS = "Amp & Cab"

# Map original type strings → ENUM values
TYPE_REMAP = {
    "Synth / Samplers": ["Synth", "Sampler"],
    "Preamps & DI":     ["Preamp", "DI"],
}

# All valid ENUM values (anything not in TYPE_REMAP maps to itself)
VALID_TYPES = {
    "Bass", "Cabinet", "Channel Strip", "Combo", "Console", "Delay",
    "Drums", "Dynamics", "EQ", "Harmonic Coloration", "Head",
    "Keyboard", "Microphone", "Modulation", "Multi Effects",
    "Pitch Tools", "Preamp", "DI", "Reverb", "Sampler",
    "Spatial Processing", "Speaker", "Stomp", "Studio", "Synth",
    "Tape Machine", "Utility",
}


def clean(val):
    if val is None:
        return ""
    v = str(val).strip()
    return v if v else ""


def normalize_vendor(v):
    """Strip parenthetical suffixes, e.g. 'A/DA (Analog Digital Associates) ' → 'a/da'."""
    return re.sub(r"\s*\(.*?\)\s*", "", v).strip().lower()


def map_types(type_str):
    """Return list of ENUM values, or [] if the types include 'Amp & Cab'."""
    if not type_str:
        return []
    parts = [p.strip() for p in type_str.split(",")]
    if any(BLANK_IF_CONTAINS in p for p in parts):
        return []
    result = []
    seen = set()
    for part in parts:
        mapped = TYPE_REMAP.get(part, [part] if part in VALID_TYPES else [])
        for t in mapped:
            if t not in seen:
                seen.add(t)
                result.append(t)
    return result


def build_brand_map():
    brand_map = {}  # normalised key → brand_id
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


def load_existing(path):
    """Load existing models.csv keyed by (model_name, brand_id) → {model_id, attributes, brand_id}."""
    existing = {}
    if not path.exists():
        return existing
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name     = clean(row.get("model_name"))
            brand_id = clean(row.get("brand_id"))
            if name:
                existing[(name, brand_id)] = {
                    "model_id":   clean(row.get("model_id")),
                    "brand_id":   brand_id,
                    "attributes": clean(row.get("attributes")),
                }
    return existing


def main():
    print("=" * 60)
    print("  STUD.io — Models CSV Converter")
    print("=" * 60)

    brand_map = build_brand_map()
    existing  = load_existing(OUT_CSV)
    if existing:
        print(f"  Preserving {len(existing)} existing rows (UUIDs + attributes + manual brand_ids)")

    rows = []
    unmatched = set()
    unknown_types = set()

    with open(IMPORT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            model_name = clean(row.get("Model Name"))
            if not model_name:
                continue

            vendor   = clean(row.get("Vendor"))
            brand_id = lookup_brand(vendor, brand_map)

            # Look up existing row by (model_name, brand_id) for UUID + attributes preservation
            prior = existing.get((model_name, brand_id), {})
            if vendor and not brand_id:
                unmatched.add(vendor)

            type_str    = clean(row.get("Type"))
            model_types = map_types(type_str)

            # Flag unknown types that weren't blank-due-to-Amp&Cab
            if type_str and not any(BLANK_IF_CONTAINS in p for p in type_str.split(",")):
                for p in type_str.split(","):
                    p = p.strip()
                    if p and p not in VALID_TYPES and p not in TYPE_REMAP:
                        unknown_types.add(p)

            rows.append({
                "model_id":        prior.get("model_id") or str(uuid.uuid4()),
                "brand_id":        brand_id,
                "model_name":      model_name,
                "model_types":     ",".join(model_types),
                "creator":         clean(row.get("Founder")),
                "years_active":    clean(row.get("Year")),
                "links":           clean(row.get("Link")),
                "description":     clean(row.get("Description")),
                "recording_notes": clean(row.get("Recording notes")),
                "artist_reference": clean(row.get("Artists")),
                "attributes":      prior.get("attributes") or "",
            })

    fieldnames = [
        "model_id", "brand_id", "model_name", "model_types",
        "creator", "years_active", "links", "description",
        "recording_notes", "artist_reference", "attributes",
    ]
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n  {len(rows)} models → {OUT_CSV.name}")

    if unknown_types:
        print(f"\n  Unknown types not in ENUM ({len(unknown_types)}) — review manually:")
        for t in sorted(unknown_types):
            print(f"    - {t!r}")

    if unmatched:
        print(f"\n  Unmatched vendors ({len(unmatched)}) — brand_id left blank:")
        for v in sorted(unmatched):
            print(f"    - {v!r}")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
