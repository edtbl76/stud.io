# Legacy CSV Pipeline

The original data pipeline imports studio gear data from Google Sheets exports into PostgreSQL via a series of Python converter scripts. This workflow predates the ControlRoom app and is kept for bulk data refresh from the source spreadsheets.

The `studio` database is the pipeline's target and is kept separate from `masterdb`, which is managed exclusively through the application going forward.

---

## Flow

```
Google Sheets exports (import/*.csv)
        ↓
  Converter scripts (util/convert_*.py)
        ↓
  Normalized CSVs (csv/)
        ↓
  Seed generator (util/generate_seeds.py)
        ↓
  SQL seed files (sql/seeds/)
        ↓
  util/reseed.py → studio database
```

---

## Running the pipeline

```bash
./util/studio_csv.sh
```

This runs the full pipeline end-to-end: converts all raw exports, generates SQL seed files, and reseeds the `studio` database.

---

## Scripts

### `util/convert_effects.py`

Maps `import/effects.csv` (Google Sheets export) to normalized `csv/effects.csv`.

Handles:
- Field renames from sheet column names to schema field names
- Multi-value fields (types, tags, formats) split and normalized
- Parent ID resolution across tables
- UUID preservation — existing UUIDs in `csv/effects.csv` are kept on re-runs so records are stable across imports

### `util/convert_instruments.py`

Maps `import/instruments.csv` to `csv/instruments.csv`.

Same patterns as effects, plus parent ID mapping to support instruments that belong to a library or another instrument.

### `util/convert_libraries.py`

Maps `import/libraries.csv` to `csv/libraries.csv`.

### `util/convert_models.py`

Maps `import/models.csv` to `csv/models.csv`.

### `util/convert_utility.py`

Shared helpers used across all converter scripts:
- Category dispatch (maps sheet values to lookup table names)
- Field normalization (whitespace, case, separator handling)
- UUID lookups against existing CSVs

### `util/generate_seeds.py`

Reads all normalized CSVs from `csv/` and generates SQL `INSERT` files in `sql/seeds/`.

- Resolves all lookup values (tag types, effect types, plugin formats, etc.) to their UUIDs in the lookup tables
- Generates one seed file per table
- Preserves UUIDs from the normalized CSVs — re-running is safe and produces stable output

### `util/reseed.py`

Drops and recreates the `studio` database, then applies `sql/schema.sql` and all seed files from `sql/seeds/` in dependency order.

### `util/diff_effects.py` / `util/diff_models.py`

Comparison utilities. Given two CSV snapshots, they report added, removed, and changed rows. Useful for reviewing what changed in a Google Sheets export before committing to a full reseed.

```bash
python util/diff_effects.py csv/effects_old.csv csv/effects.csv
```

---

## Input files

Raw Google Sheets exports go in `import/`. These are not committed to the repository — they contain the raw spreadsheet data and are regenerated from the source spreadsheets as needed.

| File | Source |
|---|---|
| `import/effects.csv` | Effects sheet export |
| `import/instruments.csv` | Instruments sheet export |
| `import/libraries.csv` | Libraries sheet export |
| `import/models.csv` | Models sheet export |

---

## Output files

| File | Contents |
|---|---|
| `csv/effects.csv` | Normalized effects with stable UUIDs |
| `csv/instruments.csv` | Normalized instruments with stable UUIDs |
| `csv/libraries.csv` | Normalized libraries with stable UUIDs |
| `csv/models.csv` | Normalized models with stable UUIDs |
| `sql/seeds/*.sql` | Generated INSERT statements, ready for `psql` |

---

## Notes

- The `studio` database is the pipeline's output. `masterdb` is managed by the application and is not affected by the pipeline.
- UUIDs are preserved across re-runs. The converter scripts read existing UUIDs from the output CSVs and carry them forward, so re-running the pipeline on updated exports does not change existing record IDs.
- All ENUM-equivalent values (tag types, effect types, etc.) are resolved to their lookup table UUIDs at seed generation time by `generate_seeds.py`.
