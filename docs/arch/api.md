# API

## Overview

The backend is a [FastAPI](https://fastapi.tiangolo.com/) application running on Python 3.12 with [asyncpg](https://github.com/MagicStack/asyncpg) for async PostgreSQL access.

- Base URL: `https://localhost:5150`
- Interactive docs: `https://localhost:5150/docs` (Swagger UI)
- All endpoints require a JWT bearer token except `/auth/token`, `/auth/google`, `/health`, and `/scanner/scan` (which uses API key auth: `Authorization: Bearer psc_...`)

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
| `/gearlist/*` | `routers/gearlist.py` | Catch-all proxy to the internal GearList Go service |

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

**Session check:**
On mount, `AuthProvider` calls `GET /api/auth/me` (a dedicated Next.js BFF route). It reads the `controlroom_token` cookie and proxies to FastAPI `GET /auth/me`. Returns `{username, role}` if valid, 401 otherwise.

**Subsequent requests:**
All other API calls use relative `/api/...` paths. The Next.js catch-all proxy reads the `controlroom_token` cookie and adds `Authorization: Bearer <token>` before forwarding to FastAPI.

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
GET /effects?limit=100&offset=0&sort_by=effect_name&sort_by=brand_name&sort_dir=asc&sort_dir=asc&filter_name=reverb
```

Query parameters:

| Parameter | Default | Description |
|---|---|---|
| `limit` | 100 | Number of records to return (max 100) |
| `offset` | 0 | Number of records to skip |
| `sort_by` | table-specific | Repeated param — one per sort level. Each must be in the router's `sortable` set; invalid values are skipped. Falls back to the default sort if all are invalid or absent. |
| `sort_dir` | `asc` | Repeated param — parallel to `sort_by`. Each value is `asc` or `desc`. Defaults to `asc` for any level whose `sort_dir` entry is missing. |
| `filter_<key>` | — | Per-column filter value. Key is the `filterParam` defined per column. Default operator is `contains` (ILIKE `%value%`). |
| `filter_<key>_op` | `contains` | Operator override for the corresponding filter key. See operator table below. Value-free operators (`is_empty`, `is_not_empty`) send only this param with no value. |
| `filter_<key>_end` | — | Range end for `date_between` — ISO date string (`YYYY-MM-DD`). |

**Filter operators:**

| Operator | Applies to | SQL produced |
|---|---|---|
| `contains` | text, array/EXISTS fields | `col ILIKE '%value%'` |
| `equals` | text fields with `col_expr` | `col = value` |
| `fuzzy` | text fields with `col_expr` | `similarity(col, value) > 0.3` (requires pg_trgm) |
| `is_empty` | any field with `col_expr` or `empty_expr` | `(col IS NULL OR col = '')` or custom `empty_expr` |
| `is_not_empty` | any field with `col_expr` or `empty_expr` | `(col IS NOT NULL AND col <> '')` or negated `empty_expr` |
| `date_on` | date columns | `DATE(col) = value` |
| `date_before` | date columns | `DATE(col) < value` |
| `date_after` | date columns | `DATE(col) > value` |
| `date_between` | date columns | `DATE(col) BETWEEN value AND filter_<key>_end` |

Multiple `filter_*` params are AND-combined. Unknown filter keys are silently ignored. Filter keys must match `[a-z_]+`.

Array/relational columns (types, tags, models, parents, formats) use `empty_expr` (e.g. `cardinality(col) = 0`) to support `is_empty`/`is_not_empty`. EXISTS subquery fields only support `contains`.

Response model: `{ items: [...], total: <int> }` (`PagedResponse`).

Each router defines a `filterable` mapping of key → `FilterableField` (`routers/filter_operators.py`). `FilterableField` has three optional fields: `contains_expr` (ILIKE template), `col_expr` (bare column for scalar/date ops), and `empty_expr` (custom SQL for empty check).

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

### Entity typeahead endpoint

```
GET /search/entities?q=<query>[&exclude_table=<table>][&exclude_id=<uuid>]
```

ILIKE substring search across effects, instruments, and libraries. Used by the `ParentSelect` component to populate parent assignment dropdowns in edit mode and bulk edit.

| Parameter | Default | Description |
|---|---|---|
| `q` | required | Search query — required, but may be blank or whitespace-only, which yields 200 with empty results |
| `exclude_table` | `""` (optional) | Table name to exclude from results (prevents a record from selecting itself as a parent) |
| `exclude_id` | `00000000-0000-0000-0000-000000000000` (optional) | Record ID to exclude from results — combined with `exclude_table` |

Response model: `{ results: [{ table_name, id, name, brand_name }] }`. Results are ordered by name. Capped at 20 results (`ENTITY_SEARCH_LIMIT = 20` in `routers/search.py`). Returns 200 with empty results for a blank query — does not return 422.

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

Tests use a separate `masterdb_test` database. Each test wraps its operations in a transaction that is rolled back at teardown, keeping tests isolated and fast.

---

## GearList proxy

All routes under `/gearlist/*` are handled by `routers/gearlist.py`, which forwards requests to the internal GearList Go service (`gearlist_backend`).

**Configuration**

| Item | Detail |
|---|---|
| Upstream URL | `GEARLIST_URL` env var (default `http://gearlist_backend:4001`) |
| Client | `httpx.AsyncClient` lazy singleton, timeout 30 s |
| Auth | `get_current_user` — all routes require a valid JWT |

**Forwarded request**

The proxy strips the outer auth layer and passes the validated user identity to the Go service via headers:

- `X-User` — `user.username`
- `X-Role` — `user.role`
- Request body and query parameters are forwarded unchanged.

**Response**

Status code, body, and `Content-Type` are passed through from the Go service unmodified.

**Go service endpoints**

| Method | Path | Description |
|---|---|---|
| `GET` | `/gearlist/health` | Health check — `{"status":"ok"}` |
| `GET` | `/gearlist/gear-types` | List all gear types |
| `POST` | `/gearlist/gear-types` | Create gear type (admin) |
| `GET` | `/gearlist/gear-types/{id}` | Get gear type |
| `PATCH` | `/gearlist/gear-types/{id}` | Update gear type (admin) |
| `DELETE` | `/gearlist/gear-types/{id}` | Soft-delete gear type (admin) |
| `GET` | `/gearlist/gear` | List gear (filterable by `name`, `type_id`) |
| `POST` | `/gearlist/gear` | Create gear item (admin) |
| `GET` | `/gearlist/gear/{id}` | Get gear item |
| `PATCH` | `/gearlist/gear/{id}` | Update gear item (admin) |
| `DELETE` | `/gearlist/gear/{id}` | Soft-delete gear item (admin) |
| `GET` | `/gearlist/gear/{id}/history` | Audit history for a gear item |
| `POST` | `/gearlist/gear/{id}/photo` | Upload photo (admin; `Content-Type: image/jpeg`, `image/png`, or `image/webp`, max 10 MB) |
| `GET` | `/gearlist/gear/{id}/maintenance` | List maintenance log entries |
| `POST` | `/gearlist/gear/{id}/maintenance` | Add maintenance log entry (admin) |

The Go service never receives the original JWT. It trusts `X-User`/`X-Role` because it is not reachable outside the Docker bridge network.

The gear list endpoint uses the same `{ items: [...], total: N }` response shape as FastAPI paginated endpoints. `gear-types` returns a flat array.

---

## Admin operations

### Backup

`GET /admin/backup` — streams a `pg_dump` of `masterdb` as a SQL file download. The file includes an embedded manifest (row counts and content hashes per table) as a comment block at the top, enabling later verification.

### Restore

`POST /admin/restore` — accepts a `.sql` file upload and pipes it through `psql` against the existing `masterdb`. This performs an object-level restore within the existing database (no DROP/CREATE of the database itself). The operation is destructive at the object level — existing data is overwritten — and irreversible.

### Verify

`POST /admin/verify` — accepts a `.sql` backup file, restores it to a temporary per-request database (`masterdb_verify_<uuid>`), computes content hashes per table, compares against the embedded manifest, and returns a pass/fail report. The temporary database is always dropped after verification, and the unique name ensures concurrent verifications do not interfere. Returns 400 if the file has no manifest (pre-manifest backup or wrong file).

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

`POST /admin/change-review/{audit_id}/undo` — admin only. Reverses the original operation: hard-deletes a CREATE record, restores `old_data` for an UPDATE, or clears `deleted_at` for a DELETE. Sets `undone_at`/`undone_by` on the audit entry. Does not create a new audit entry. Returns 409 if already resolved or if a FK violation prevents the undo. UPDATE restoration skips `created_at` and `updated_at` (both are auto-managed columns); all other fields are restored, with UUID and datetime strings in `old_data` coerced back to their native types before binding to the database.

`DELETE /admin/change-review/{audit_id}/permanent` — admin only. Hard-deletes the record referenced by a `DELETE` audit entry (confirms permanent deletion). Sets `undone_at`/`undone_by`. Returns 204. Returns 400 for non-DELETE entries, 409 if already resolved.

### Plugin Scanner

All scanner routes live under `/scanner`. Scan ingest uses API key auth (`Authorization: Bearer psc_...`); all other routes use JWT bearer auth.

#### Core

`POST /scanner/scan` — API key auth. Accepts a raw plugin scan from the plugin-scanner binary. Runs 3-tier matching (exact → fuzzy vendor+name → fuzzy name-only) against all active catalog records, resolves persistent links first, detects orphaned records. At ingest time, matched results are classified as `known` (catalog record has `disk_paths` populated) or `matched` (no `disk_paths`). Returns a `ScanSummary` with counts by status. The entire operation is atomic (one transaction).

`GET /scanner/report[?scan_id=UUID]` — authenticated user. Returns the scan grouped into eight sections: `known` (matched, catalog has disk paths), `matched` (matched, no disk paths), `conflicted` (version mismatch between disk and catalog), `unconfirmed` (fuzzy match awaiting review), `untracked` (no match found), `orphaned` (previously confirmed, catalog record missing from disk), `ignored`, and `absent` (catalog records with known disk paths not found in this scan — contains catalog metadata: record id/table/name/vendor/version/disk paths, not scanned plugin data). The seven scan-result sections each include scanned metadata and match context (confidence, score, matched record, catalog disk paths). If `scan_id` is omitted, returns the latest scan. Returns 404 if no scan found.

`GET /scanner/catalog/search?q={query}[&table={table}]` — authenticated user. ILIKE search across all catalog tables (or a single table if `table` is specified). Returns up to 20 results ordered by name. Returns 400 if `table` is non-empty and not a known catalog table.

`POST /scanner/confirm` — admin only. Accepts a list of confirmation decisions. Each item specifies a `result_id` and `action`:
- `confirm` — links the scanned plugin to the matched record; updates version in the catalog table; writes a `scanner_plugin_links` entry.
- `reject` — clears the match; plugin reverts to `untracked`; removes the persistent link if one existed.
- `ignore` — adds the plugin to `scanner_exclusions`; status becomes `ignored`; excluded from all future scans.
- `create` — inserts a new record in the specified `target_table`; links it; status becomes `matched` or `known`.
- `acknowledge` — sets `confirmed_at` on the result; writes a `scanner_plugin_links` entry; status unchanged. Used for `known` and `matched` results the user has reviewed.
- `force` — overrides the match to a user-selected catalog record (`target_id`, `target_table`); status becomes `matched` or `known`; writes a `scanner_plugin_links` entry.

Confirmation errors are isolated per item (one failure does not roll back others). Returns `{applied, errors}`.

#### Orphan Management (admin only)

`PATCH /scanner/results/{result_id}/dismiss` — admin only. Sets `dismissed_at` on the scan result, hiding it from the current report. The orphan reappears in future scan runs (dismissed_at is per-result-row, not global). Returns 204 or 404.

`PATCH /scanner/links/{link_id}/keep` — admin only. Sets `keep_permanently = true` on the confirmed plugin link, suppressing orphan flagging for that plugin in all future scans. Returns 204 or 404.

#### API Key Management (admin only)

`GET /scanner/keys` — list all API keys (label, hint, created/revoked timestamps). Hashed key never returned.

`POST /scanner/keys` — create a new API key. Body: `{label}`. Returns the full key (`psc_` + 64 hex chars) once — it cannot be retrieved again.

`DELETE /scanner/keys/{key_id}` — revoke a key (sets `revoked_at`). Returns 404 if already revoked.

#### Exclusion Management (admin only)

`POST /scanner/exclude` — add a plugin to the exclusion list. Body: `{vendor, name}`. Idempotent (ON CONFLICT DO NOTHING).

`DELETE /scanner/exclude/{exclusion_id}` — remove an exclusion. Returns 404 if not found.

#### Scan History

`GET /scanner/scans` — authenticated user. Returns all scan runs with per-run status counts and confirmation counts, newest first.

`DELETE /scanner/scans?older_than_days=N` — admin only. Hard-deletes scan runs (and their results via CASCADE) older than N days. Returns `{deleted_count}`.
