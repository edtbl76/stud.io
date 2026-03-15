#!/usr/bin/env python3
"""
STUD.io — Libraries CSV Converter

Reads import/Studio 2026 - Libraries.csv and generates csv/libraries.csv,
mapping manufacturerName → brand_id and Models → model_ids.

Usage:
    python convert_libraries.py
"""

import csv
import re
import uuid
from pathlib import Path

BASE        = Path(__file__).parent.parent
IMPORT_CSV  = BASE / "import" / "Studio 2026 - Libraries.csv"
BRANDS_CSV  = BASE / "csv" / "brands.csv"
MODELS_CSV  = BASE / "csv" / "models.csv"
OUT_CSV     = BASE / "csv" / "libraries.csv"


def clean(val):
    if val is None:
        return ""
    v = str(val).strip().replace("\r\n", "\n").replace("\r", "\n")
    return v if v else ""


def normalize_vendor(v):
    return re.sub(r"\s*\(.*?\)\s*", "", v).strip().lower()


def normalize_model_key(name):
    return re.sub(r"'(\d)", r"\1", name).strip().lower()


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
    """full_model_name.lower() → model_id."""
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


def lookup_models(model_str, model_map):
    """Return list of model_ids for newline-separated model names."""
    if not model_str:
        return []
    model_ids = []
    for name in model_str.split("\n"):
        name = name.strip()
        if not name:
            continue
        entry = model_map.get(normalize_model_key(name))
        if entry:
            model_ids.append(entry)
    return model_ids


def load_existing(path):
    """Load existing libraries.csv keyed by (library_name, brand_id) → {library_id, attributes}."""
    existing = {}
    if not path.exists():
        return existing
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name     = clean(row.get("library_name"))
            brand_id = clean(row.get("brand_id"))
            if name:
                existing[(name, brand_id)] = {
                    "library_id": clean(row.get("library_id")),
                    "attributes": clean(row.get("attributes")),
                }
    return existing


def main():
    print("=" * 60)
    print("  STUD.io — Libraries CSV Converter")
    print("=" * 60)

    brand_map = build_brand_map()
    model_map = build_model_map()
    existing  = load_existing(OUT_CSV)
    if existing:
        print(f"  Preserving {len(existing)} existing rows (UUIDs + attributes)")

    rows                    = []
    unmatched_manufacturers = set()
    unmatched_models        = set()

    with open(IMPORT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            library_name = clean(row.get("name"))
            if not library_name:
                continue

            manufacturer = clean(row.get("manufacturerName"))
            model_str    = clean(row.get("Models"))
            notes        = clean(row.get("Notes"))

            brand_id = lookup_brand(manufacturer, brand_map)
            if manufacturer and not brand_id:
                unmatched_manufacturers.add(manufacturer)

            model_ids_list = lookup_models(model_str, model_map)
            if model_str and not model_ids_list:
                for name in model_str.split("\n"):
                    name = name.strip()
                    if name:
                        unmatched_models.add(name)

            prior = existing.get((library_name, brand_id), {})
            rows.append({
                "library_id":   prior.get("library_id") or str(uuid.uuid4()),
                "brand_id":     brand_id,
                "model_ids":    ",".join(model_ids_list),
                "library_name": library_name,
                "notes":        notes,
                "attributes":   prior.get("attributes") or "",
            })

    fieldnames = [
        "library_id", "brand_id", "model_ids", "library_name", "notes", "attributes",
    ]
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n  {len(rows)} libraries → {OUT_CSV.name}")

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
