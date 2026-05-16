# Data Model

## Databases

All three databases live in the same PostgreSQL 17 container (`studio_db`), using the `pgvector/pgvector:pg17` image which includes the pgvector extension.

| Database | Purpose |
|---|---|
| `masterdb` | Application database — used by the API and UI |
| `masterdb_test` | Test database — structurally identical to `masterdb`; used by the automated test suite |
| `studio` | Legacy CSV pipeline target — source of truth for seeded data; not used by the app directly |

---

## Schema overview

### Lookup tables

All enumerable values are stored as lookup tables rather than PostgreSQL ENUMs. This allows values to be managed through the UI without schema migrations.

| Table | Used by |
|---|---|
| `entity_types` | `brands` |
| `tool_types` | `workstations`, `measurement_tools`, `reference_tools`, `workflow_tools`, `composition_tools`, `admin_tools`, `effects`, `instruments` |
| `plugin_formats` | same tool tables + `effects`, `instruments` |
| `tag_types` | all major tables |
| `effect_types` | `effects` |
| `instrument_types` | `instruments` |
| `model_types` | `models` |
| `gear_types` | `gear` — managed via Studio Management Config; seeded with Guitar, Amp, Pedal, Bass, Keyboard, Drum Machine, Synth, Other |

Array columns (e.g. `tag_ids UUID[]`) store references to these lookup tables directly in the row. There are no join tables.

### Core tables

| Table | Description |
|---|---|
| `brands` | Companies, recording studios, and individual builders. `brand_name` is NOT NULL — required on create. `legal_name` is nullable and optional. |
| `models` | Physical/hardware gear — amps, microphones, synths, keyboards |
| `effects` | Software and hardware effects, optionally linked to a model. Includes `disk_paths JSONB` (array of `{path, format, version}` entries) populated manually to record known installation locations used by the plugin scanner. |
| `instruments` | Software instruments — synths, samplers, keyboards, drums. Includes `disk_paths JSONB`. |
| `libraries` | Sample libraries and content packs. Includes `disk_paths JSONB`. |
| `workstations` | DAWs and mastering suites. Includes `disk_paths JSONB`. |
| `measurement_tools` | Meters, analyzers, and diagnostic applications. Includes `disk_paths JSONB`. |
| `reference_tools` | Room correction, headphone reference, and monitoring plugins. Includes `disk_paths JSONB`. |
| `workflow_tools` | Standalone studio utilities (routing, browsing, editing). Includes `disk_paths JSONB`. |
| `composition_tools` | Scoring, notation, and composition applications. Includes `disk_paths JSONB`. |
| `admin_tools` | License managers, downloaders, product portals. Includes `disk_paths JSONB`. |
| `users` | Application user accounts |

### GearList tables (Go service — `gearlist_backend`)

These tables are defined in `sql/gearlist_schema.sql` and owned by the Go `gearlist_backend` service. They live in the same PostgreSQL instance (`masterdb`) as the FastAPI tables.

| Table | Description |
|---|---|
| `gear_types` | Lookup table for gear categories (Guitar, Amp, Pedal, etc.). Same shape as FastAPI lookup tables: `type_id UUID PK`, `type_name TEXT NOT NULL UNIQUE`, `type_description TEXT`, `deleted_at TIMESTAMPTZ`. |
| `gear` | Individual gear items. References `gear_types`. Guitar-specific fields: `num_strings INT`, `tuning TEXT`, `pickup_config TEXT` (SSS/HH/HSH/SSH), `pickup_neck_model_id UUID`, `pickup_middle_model_id UUID`, `pickup_bridge_model_id UUID`. Also stores `photo_key TEXT` (MinIO object path). Soft-deleted via `deleted_at`. |
| `gear_maintenance_log` | Append-only log of maintenance events for a gear item. Fields: `log_id UUID PK`, `gear_id UUID FK`, `event_type TEXT` (restring/setup/repair/modification/other), `notes TEXT`, `event_date DATE`, `created_at TIMESTAMPTZ`. No update or delete. |

A `gear_view` in `sql/views.sql` joins `gear` with `gear_types` to resolve `gear_type_name` for list queries.

Every write to `gear_types` and `gear` is recorded in the shared `audit_log` table.

### Plugin Scanner tables (FastAPI — `scanner_schema.sql`)

Defined in `sql/scanner_schema.sql`. Used by the FastAPI scanner routes and the plugin-scanner binary.

| Table | Description |
|---|---|
| `plugin_scans` | One row per scan run uploaded by the plugin-scanner binary. Fields: `scan_id UUID PK`, `scanned_at TIMESTAMPTZ`, `source_machine TEXT`, `total_count INT`. No soft delete — hard-deleted when purged. |
| `plugin_scan_results` | One row per discovered plugin per scan. FK to `plugin_scans` with `ON DELETE CASCADE`. Stores raw scanned metadata (`name`, `vendor`, `version`, `format`, `path`), server-side match result (`status`, `confidence`, `score`, `record_id`, `record_table`), confirmation state (`confirmed_at`, `confirmed_by`), and soft-hide flag (`dismissed_at`). Status values: `known` (matched, catalog has disk_paths), `matched` (matched, no disk_paths), `conflicted` (version mismatch), `unconfirmed` (fuzzy match), `untracked` (no match), `orphaned` (confirmed link but record absent from disk), `ignored`. No soft delete. |
| `scanner_api_keys` | API keys for plugin-scanner binary authentication. Stores `label TEXT`, `key_hint TEXT` (last 4 chars of plaintext), `hashed_key TEXT UNIQUE` (bcrypt), `created_at`, `revoked_at`. Plaintext key never stored. |
| `scanner_exclusions` | Plugins excluded from all future scan reports. Fields: `exclusion_id UUID PK`, `vendor TEXT`, `name TEXT`, `excluded_at TIMESTAMPTZ`. UNIQUE constraint on `(vendor, name)`. |
| `scanner_plugin_links` | Persistent confirmed match links — survives scan history purges. Maps a scanned plugin fingerprint (`"{vendor} {name}".lower().strip()`) to a confirmed ControlRoom catalog record. Written on `confirm`, `create`, `acknowledge`, and `force` actions; deleted on `reject`. UNIQUE on `fingerprint`. |

### Soft delete

All content tables (brands, models, effects, instruments, libraries, workstations, and all five tool tables) and all lookup/config tables have a `deleted_at TIMESTAMPTZ` column. Deleting a record through the API sets `deleted_at` to the current time rather than removing the row. All semantic views filter `WHERE deleted_at IS NULL` so soft-deleted records are invisible to normal queries.

Hard deletion (permanently removing the row) is performed through the Change Review admin endpoint after a soft-delete has been reviewed.

### Audit log

Every write operation (CREATE, UPDATE, DELETE) on content and config tables is recorded in the `audit_log` table. The API routers call `log_audit()` inside the same transaction as the data change.

| Column | Description |
|---|---|
| `audit_id` | UUID primary key |
| `table_name` | Name of the affected table |
| `record_id` | UUID of the affected record |
| `operation` | `CREATE`, `UPDATE`, or `DELETE` |
| `performed_by` | Username of the user who made the change |
| `performed_at` | Timestamp of the change |
| `old_data` | JSON snapshot of the row before the change (null for CREATE). All values are serialized to JSON-safe types (UUIDs and datetimes become strings). On undo, `apply_old_data()` coerces them back to native Python types before binding to the database. |
| `new_data` | JSON snapshot of the row after the change (null for DELETE) |
| `acknowledged_at` / `acknowledged_by` | Set when an admin reviews the entry via Change Review |
| `undone_at` / `undone_by` | Set when an admin reverses the change via Change Review |

### Parent references

Effects, instruments, and libraries support a `parent_ids` column of type `parent_ref[]`, where `parent_ref` is a PostgreSQL composite type `(table_name TEXT, id UUID)`. This allows a record to reference parents in any table — e.g. a library can be parented to an instrument or another library.

---

## Semantic views

`sql/views.sql` defines one view per major table. These views resolve all UUID references to human-readable names so the API never has to join manually.

Each view resolves:

- `brand_id` → `brand_name`
- `model_ids UUID[]` → `models` as `[{id, name}]` JSON array
- `*_type_ids UUID[]` → `*_types` as `[{id, name}]` JSON array
- `plugin_format_ids UUID[]` → `plugin_formats` as `[{id, name}]` JSON array
- `tag_ids UUID[]` → `tag_types` as `[{id, name}]` JSON array
- `parent_ids parent_ref[]` → `parents` as `[{table_name, id, name}]` JSON array
- `full_*_name` — computed concatenation of brand name + item name

**Views are regular views, not materialized.** This ensures writes are immediately visible within the same transaction, which is required for test isolation (each test wraps in a transaction that is rolled back).

### Read/write split

- **Reads:** API routers `SELECT` from the `*_view` views
- **Writes:** API routers `INSERT`/`UPDATE`/`DELETE` against the base tables directly

---

## Notes fields

Different tables carry different notes fields based on what's relevant:

| Table | `description` | `workflow_notes` | `instrument_notes` | `recording_notes` | `artist_reference` |
|---|---|---|---|---|---|
| Effects | ✓ | ✓ | — | ✓ | ✓ |
| Instruments | ✓ | — | ✓ | ✓ | — |
| Libraries | ✓ | — | ✓ | ✓ | — |
| Models | ✓ | — | — | ✓ | ✓ |
| Brands | ✓ | — | — | — | — |
| Workstations | ✓ | ✓ | — | — | — |
| Tool tables | ✓ | ✓ | — | — | — |

---

## Object storage (MinIO)

Gear photo uploads are stored in [MinIO](https://min.io/), an S3-compatible object store running as a Docker service.

| Item | Detail |
|---|---|
| API port | 1983 |
| Admin console | 1982 |
| Bucket | `studio-photos` (created on first boot by init script) |
| Object key format | `gear/{gear_id}/photo.{ext}` |
| Accepted formats | `image/jpeg`, `image/png`, `image/webp` |
| Max upload size | 10 MB (enforced by `gearlist_backend` before the MinIO call) |

The Go service uploads photos directly to MinIO using the `minio-go` client. If the subsequent database write fails, the uploaded object is deleted to prevent orphans. The frontend retrieves photos via the FastAPI BFF proxy at `/gearlist/gear/{id}/photo` (not yet implemented as a separate GET — currently the `photo_key` is stored and clients construct the URL separately).

## Schema and migrations

The schema lives in three files applied idempotently by `roadie build` in order: `schema.sql` (FastAPI catalog tables) → `gearlist_schema.sql` (GearList Go service tables) → `scanner_schema.sql` (Plugin Scanner tables) → `views.sql` (semantic read views).

### Additive schema changes (new columns, new tables)

1. Edit the relevant base file (`schema.sql`, `gearlist_schema.sql`, `scanner_schema.sql`, or `views.sql`) to add the new definition.
2. Create a migration file in `sql/migrations/` using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (or equivalent idempotent DDL).
3. Add the migration file to `build.schema_files` in `roadie.yml` so fresh CI databases and new dev setups pick it up.
4. Apply to the running production database: `roadie db migrate`
5. Apply to the running test databases: `roadie db migrate --test`

### Destructive schema changes (column renames, type changes)

The database must be dropped and recreated — use the Backup & Restore feature in the Admin UI to preserve data before doing so.
