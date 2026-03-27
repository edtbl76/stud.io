# API

## Overview

The backend is a [FastAPI](https://fastapi.tiangolo.com/) application running on Python 3.12 with [asyncpg](https://github.com/MagicStack/asyncpg) for async PostgreSQL access.

- Base URL: `https://localhost:5150`
- Interactive docs: `https://localhost:5150/docs` (Swagger UI)
- All endpoints require a JWT bearer token except `/auth/token`, `/auth/google`, and `/health`

---

## Routers

| Prefix | File | Description |
|---|---|---|
| `/auth` | `routers/auth.py` | Login, token refresh, Google OAuth callback |
| `/brands` | `routers/brands.py` | CRUD for brands |
| `/models` | `routers/models.py` | CRUD for models |
| `/effects` | `routers/effects.py` | CRUD for effects |
| `/instruments` | `routers/instruments.py` | CRUD for instruments |
| `/libraries` | `routers/libraries.py` | CRUD for libraries |
| `/workstations` | `routers/workstations.py` | CRUD for workstations |
| `/tools/{category}` | `routers/tools.py` | CRUD for all tool tables (admin, composition, measurement, reference, workflow) |
| `/config/{slug}` | `routers/config.py` | CRUD for all lookup tables (effect-types, tag-types, etc.) |
| `/search` | `routers/search.py` | Cross-table full-text search (PostgreSQL FTS) |
| `/admin` | `routers/backup_ops.py`, `routers/change_review.py`, `routers/admin_stats.py`, `routers/import_export.py` | Database backup, restore, verification, Change Review workflow, catalog row-count stats, and xlsx import/export |
| `/users` | `routers/users.py` | User management (admin only) |

---

## Authentication

JWT-based. Tokens are signed with HS256 using `JWT_SECRET` and expire after `JWT_EXPIRE_MINUTES` (default 8 hours).

The FastAPI auth endpoints are not called directly from the browser. All auth flows go through the Next.js BFF, which stores the JWT in an httpOnly cookie and never exposes it to client-side JavaScript.

**Username/password login flow:**
1. Browser calls `POST /api/auth/token` (Next.js BFF)
2. BFF forwards credentials to FastAPI `POST /auth/token` → receives `{access_token}`
3. BFF calls `GET /auth/me` with the token to fetch `{username, role}`
4. BFF sets `controlroom_token` httpOnly cookie and returns `{username, role}` to the browser

**Google Sign-In flow:**
1. Frontend renders the Google Identity button (requires `NEXT_PUBLIC_GOOGLE_CLIENT_ID`)
2. Google returns a credential (ID token) to the frontend callback
3. Browser calls `POST /api/auth/google` (Next.js BFF) with the ID token
4. BFF forwards the credential to FastAPI `POST /auth/google` → receives `{access_token}`
5. BFF sets the httpOnly cookie and returns `{username, role}` to the browser
6. If no account is linked to that Google ID, FastAPI returns 401 and the BFF forwards it

**Subsequent requests:**
All API calls use relative `/api/...` paths. The Next.js catch-all proxy reads the `controlroom_token` cookie and adds `Authorization: Bearer <token>` before forwarding to FastAPI.

**Default admin account:** `admin` / `admin` — seeded automatically on first startup if no users exist.

---

## Authorization (RBAC)

Two roles: `admin` and `user`.

- `user` — read-only access (GET endpoints only)
- `admin` — full access (GET, POST, PUT, DELETE, plus the `/admin` and `/users` routers)

Role is embedded in the JWT payload. The `require_admin` dependency in `routers/auth.py` enforces this at the router level — it's applied to all write endpoints.

---

## Common patterns

### List endpoint (paginated)

All content table list endpoints use server-side pagination with sorting and optional per-column filtering:

```
GET /effects?limit=100&offset=0&sort_by=effect_name&sort_dir=asc&filter_name=reverb&filter_brand=moog
```

Query parameters:

| Parameter | Default | Description |
|---|---|---|
| `limit` | 100 | Number of records to return (max 100) |
| `offset` | 0 | Number of records to skip |
| `sort_by` | table-specific | Column to sort by (must be in the router's `sortable` set) |
| `sort_dir` | `asc` | `asc` or `desc` |
| `filter_<key>` | — | Per-column filter; key is the `filterParam` suffix defined per router. Values use `ILIKE %value%`. Wrap in double quotes for exact match (`"value"` → `= value`). Multiple `filter_*` params are AND-combined. |

Response model: `{ items: [...], total: <int> }` (`PagedResponse`).

Each router defines a `filterable` mapping of key → SQL expression template. Unknown filter keys are silently ignored. Filter keys must match `[a-z_]+`.

### CRUD endpoints

```
GET    /{resource}/{id}     # Get one record (from view)
POST   /{resource}          # Create (inserts into base table, returns from view)
PATCH  /{resource}/{id}     # Update (updates base table, returns from view)
DELETE /{resource}/{id}     # Soft-delete (sets deleted_at, does not remove the row)
```

After every write, the response re-fetches from the semantic view so the returned record includes all resolved display names.

### Record history endpoint

Every content router and both dynamic routers expose a history endpoint:

```
GET /{resource}/{id}/history          # individual content routers (brands, models, effects, etc.)
GET /tools/{category}/{id}/history    # tools router (resolves table from category)
GET /config/{slug}/{id}/history       # config router (resolves table from slug)
```

Accessible by any authenticated user. Returns all `audit_log` entries for the given record sorted `performed_at DESC`, with `old_data` and `new_data` fully included (unlike the Change Review list endpoint). No pagination — a single record's history is bounded.

Response model: `list[AuditEntryWithData]` (defined in `routers/_helpers.py`).

### Search endpoint

```
GET /search?q=<query>[&notes=false][&limit=100]
```

Cross-table full-text search using PostgreSQL `to_tsvector` / `websearch_to_tsquery`. Searches across all 11 content tables (brands, models, effects, instruments, libraries, workstations, and all five tool tables).

Query parameters:

| Parameter | Default | Description |
|---|---|---|
| `q` | required | Search query — minimum 2 characters; returns 422 if shorter |
| `notes` | `false` | When `true`, extends search to description, notes, and reference fields |
| `limit` | 100 | Max results (capped at 200) |

Response model: `{ results: [{ table, id, name, brand_name, rank }], total }`.

Results are ranked by `ts_rank` descending. `total` reflects the full match count before the limit is applied. `brand_name` is `null` for tables that have no brand relationship (brands itself).

### Dynamic router: tools

`/tools/{category}` maps to one of five base tables based on the category path parameter:

| Category | Table |
|---|---|
| `admin` | `admin_tools` |
| `composition` | `composition_tools` |
| `measurement` | `measurement_tools` |
| `reference` | `reference_tools` |
| `workflow` | `workflow_tools` |

### Dynamic router: config

`/config/{slug}` maps to one of seven lookup tables:

| Slug | Table |
|---|---|
| `effect-types` | `effect_types` |
| `entity-types` | `entity_types` |
| `instrument-types` | `instrument_types` |
| `model-types` | `model_types` |
| `plugin-formats` | `plugin_formats` |
| `tag-types` | `tag_types` |
| `tool-types` | `tool_types` |

---

## Database connection

asyncpg connection pool initialized at startup via the FastAPI `lifespan` context. Pool settings are configured in `database.py`. Each request acquires a connection from the pool for the duration of the request.

Tests use a separate `controlroomdb_test` database. Each test wraps its operations in a transaction that is rolled back at teardown, keeping tests isolated and fast.

---

## Admin operations

### Backup

`GET /admin/backup` — streams a `pg_dump` of `controlroomdb` as a SQL file download. The file includes an embedded manifest (row counts and content hashes per table) as a comment block at the top, enabling later verification.

### Restore

`POST /admin/restore` — accepts a `.sql` file upload, drops and recreates `controlroomdb`, then pipes the file through `psql` to restore. This is destructive and irreversible.

### Verify

`POST /admin/verify` — accepts a `.sql` backup file, restores it to a temporary `controlroomdb_verify` database, computes content hashes per table, compares against the embedded manifest, and returns a pass/fail report. The temporary database is always dropped after verification. Returns 400 if the file has no manifest (pre-manifest backup or wrong file).

### Import / Export

Three endpoints in `routers/import_export.py`. All require admin. xlsx files are built and parsed with **openpyxl**.

`GET /admin/export/xlsx?tables=<comma-separated>` — exports current (non-deleted) records. One sheet per table, one row per record. ID columns are included for round-trip updates. Column schema is defined in `routers/_xlsx_schema.py` (`TABLE_CONFIGS`). Lookup display names are resolved from the semantic views. A hidden `_Lookups` sheet is included with all valid lookup values per column (used by template dropdowns).

`GET /admin/export/template?tables=<comma-separated>` — same structure but no data rows and no ID column. Lookup fields have Excel `DataValidation` dropdowns referencing the `_Lookups` sheet.

`POST /admin/import/xlsx` — accepts a multipart `.xlsx` upload (max 10 MB). Parses sheet names against `SHEET_TO_KEY` (e.g. "Brands" → `brands`). Unknown sheets and empty sheets are ignored. For each recognized sheet:

- Rows **without** an "ID" cell → `INSERT`
- Rows **with** an "ID" cell → `UPDATE … WHERE deleted_at IS NULL`
- Lookup fields are resolved by name (case-insensitive) to their UUID. Multi-value fields accept comma-separated names.
- If a lookup name doesn't match, a `did you mean?` suggestion is generated via `difflib.get_close_matches`.

Validation runs across all rows before any writes. If any row has an error the endpoint returns `422` with `{"errors": [{sheet, row, column, value, message}, ...]}`. On success returns `{summary: [{sheet, creates, updates}], total_creates, total_updates}`.

The xlxs logic is split across three internal modules:
- `routers/_xlsx_schema.py` — `ColDef` / `TableConfig` named tuples and all column/table definitions
- `routers/_xlsx_build.py` — workbook construction (`fetch_lookup_data`, `fetch_table_rows`, `build_workbook`)
- `routers/_xlsx_import.py` — parsing, validation, and DB writes (`parse_workbook`, `validate_import`, `execute_import`)

### Stats

`GET /admin/stats` — returns row counts for all 18 content and lookup tables grouped by Catalog, Session, Tools, and Config. Tables within each group are sorted by count descending, display name ascending as tie-break. The `total` field is the sum across all groups and excludes the `users` table.

### Change Review

`GET /admin/change-review` — returns a paginated list of `audit_log` entries. Accessible by any authenticated user. Optional query parameters: `table` (filter by table name), `operation` (`CREATE`, `UPDATE`, `DELETE`), `status` (`pending` [default], `acknowledged`, `undone`, `all`), `page` (1-based, default 1), `page_size` (default 50, max 200). Results sorted by `performed_at DESC`. The `record_display_name` field is populated by querying each table's name column (base table, not view, so soft-deleted records still resolve); falls back to the first 8 characters of `record_id` for hard-deleted records.

`POST /admin/change-review/{audit_id}/acknowledge` — admin only. Marks the audit entry as acknowledged (`acknowledged_at`, `acknowledged_by`). Returns the updated entry. Returns 409 if already resolved.

`POST /admin/change-review/{audit_id}/undo` — admin only. Reverses the original operation: hard-deletes a CREATE record, restores `old_data` for an UPDATE, or clears `deleted_at` for a DELETE. Sets `undone_at`/`undone_by` on the audit entry. Does not create a new audit entry. Returns 409 if already resolved or if a FK violation prevents undo-CREATE.

`DELETE /admin/change-review/{audit_id}/permanent` — admin only. Hard-deletes the record referenced by a `DELETE` audit entry (confirms permanent deletion). Sets `undone_at`/`undone_by`. Returns 204. Returns 400 for non-DELETE entries, 409 if already resolved.
