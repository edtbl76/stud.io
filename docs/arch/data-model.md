# Data Model

## Databases

All three databases live in the same PostgreSQL 17 container (`studio_db`), using the `pgvector/pgvector:pg17` image which includes the pgvector extension.

| Database | Purpose |
|---|---|
| `controlroomdb` | Application database — used by the API and UI |
| `controlroomdb_test` | Test database — structurally identical to `controlroomdb`; used by the automated test suite |
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

Array columns (e.g. `tag_ids UUID[]`) store references to these lookup tables directly in the row. There are no join tables.

### Core tables

| Table | Description |
|---|---|
| `brands` | Companies, recording studios, and individual builders. `brand_name` is NOT NULL — required on create. `legal_name` is nullable and optional. |
| `models` | Physical/hardware gear — amps, microphones, synths, keyboards |
| `effects` | Software and hardware effects, optionally linked to a model |
| `instruments` | Software instruments — synths, samplers, keyboards, drums |
| `libraries` | Sample libraries and content packs |
| `workstations` | DAWs and mastering suites |
| `measurement_tools` | Meters, analyzers, and diagnostic applications |
| `reference_tools` | Room correction, headphone reference, and monitoring plugins |
| `workflow_tools` | Standalone studio utilities (routing, browsing, editing) |
| `composition_tools` | Scoring, notation, and composition applications |
| `admin_tools` | License managers, downloaders, product portals |
| `users` | Application user accounts |

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

## Schema and migrations

The schema lives in `sql/schema.sql`. It is applied idempotently by `build.sh` on startup (uses `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE VIEW`, etc.).

There is no migration framework. Schema changes are made directly to `sql/schema.sql` and applied by restarting the stack. For destructive changes (column renames, type changes), the database must be dropped and recreated — use the Backup & Restore feature in the Admin UI to preserve data.
