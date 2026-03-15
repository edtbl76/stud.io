#!/usr/bin/env python3
"""
Diff csv/models.csv vs import/Studio 2026 - Models.csv field-by-field.
Reports rows where content fields differ (description, links, creator,
years_active, recording_notes, artist_reference).

Matches on (vendor_normalized, model_name) to handle duplicate model names
across different brands.
"""

import csv
import re
from pathlib import Path

BASE        = Path(__file__).parent.parent
IMPORT_CSV  = BASE / "import" / "Studio 2026 - Models.csv"
OUT_CSV     = BASE / "csv" / "models.csv"
BRANDS_CSV  = BASE / "csv" / "brands.csv"


def clean(val):
    if val is None:
        return ""
    return str(val).strip().replace("\r\n", "\n").replace("\r", "\n")


def normalize_vendor(v):
    return re.sub(r"\s*\(.*?\)\s*", "", v).strip().lower()


FIELD_MAP = [
    ("Description",     "description"),
    ("Link",            "links"),
    ("Founder",         "creator"),
    ("Year",            "years_active"),
    ("Recording notes", "recording_notes"),
    ("Artists",         "artist_reference"),
]


def build_brand_name_map():
    """brand_id → normalized brand name (for keying output rows)."""
    m = {}
    with open(BRANDS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            bid   = clean(row.get("brand_id"))
            bname = clean(row.get("brand_name"))
            if bid and bname:
                m[bid] = normalize_vendor(bname)
    return m


def main():
    brand_name_map = build_brand_name_map()

    # Load output CSV keyed by (vendor_normalized, model_name)
    out_rows = {}
    unkeyed  = []
    with open(OUT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name     = clean(row.get("model_name"))
            brand_id = clean(row.get("brand_id"))
            vendor   = brand_name_map.get(brand_id, "")
            key      = (vendor, name)
            if name:
                out_rows[key] = row
                if not vendor:
                    unkeyed.append(name)

    diffs          = []
    only_in_import = []
    only_in_output = set(out_rows.keys())

    with open(IMPORT_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            model_name = clean(row.get("Model Name"))
            if not model_name:
                continue

            vendor = normalize_vendor(clean(row.get("Vendor", "")))
            key    = (vendor, model_name)

            # Try exact (vendor, name) match first; fall back to name-only
            if key in out_rows:
                out = out_rows[key]
            else:
                # name-only fallback for rows with no vendor or unresolved brand
                name_matches = [v for (v, n), r in out_rows.items() if n == model_name]
                if not name_matches:
                    only_in_import.append(f"{model_name} (vendor: {vendor})")
                    continue
                out = out_rows[(name_matches[0], model_name)]

            only_in_output.discard(key)

            field_diffs = []
            for imp_col, out_col in FIELD_MAP:
                imp_val = clean(row.get(imp_col))
                out_val = clean(out.get(out_col))
                if imp_val != out_val:
                    field_diffs.append((out_col, imp_val, out_val))

            if field_diffs:
                diffs.append((vendor, model_name, field_diffs))

    print(f"{'='*60}")
    print(f"  Models Diff: import vs csv")
    print(f"{'='*60}\n")

    if diffs:
        print(f"  {len(diffs)} rows with field differences:\n")
        for vendor, model_name, field_diffs in diffs:
            print(f"  [{vendor} / {model_name}]")
            for col, imp_val, out_val in field_diffs:
                print(f"    {col}:")
                print(f"      import: {imp_val!r}")
                print(f"      output: {out_val!r}")
            print()
    else:
        print("  No field differences — models.csv is in sync.\n")

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
