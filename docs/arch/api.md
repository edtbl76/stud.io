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
| `/search` | `routers/search.py` | Cross-table full-text search |
| `/admin` | `routers/admin_ops.py` | Database backup, restore, verification, and catalog row-count stats |
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

Role is embedded in the JWT payload. The `require_admin` dependency in `routers/_helpers.py` enforces this at the router level — it's applied to all write endpoints.

---

## Common patterns

### List endpoint

```
GET /effects?search=reverb
```

Returns all records from the `effects_view` semantic view. The optional `search` parameter filters by `full_effect_name` (case-insensitive `ILIKE`).

### CRUD endpoints

```
GET    /{resource}/{id}     # Get one record (from view)
POST   /{resource}          # Create (inserts into base table, returns from view)
PUT    /{resource}/{id}     # Update (updates base table, returns from view)
DELETE /{resource}/{id}     # Delete (from base table)
```

After every write, the response re-fetches from the semantic view so the returned record includes all resolved display names.

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

### Stats

`GET /admin/stats` — returns row counts for all 18 content and lookup tables grouped by Catalog, Session, Tools, and Config. Tables within each group are sorted by count descending, display name ascending as tie-break. The `total` field is the sum across all groups and excludes the `users` table.

### Change Review

`GET /admin/change-review` — returns a paginated list of `audit_log` entries. Accessible by any authenticated user. Optional query parameters: `table` (filter by table name), `operation` (`CREATE`, `UPDATE`, `DELETE`), `status` (`pending` [default], `acknowledged`, `undone`, `all`), `page` (1-based, default 1), `page_size` (default 50, max 200). Results sorted by `performed_at DESC`. The `record_display_name` field is always `null` in Sub-project 2; name resolution is added in Sub-project 3.

`POST /admin/change-review/{audit_id}/acknowledge` — admin only. Marks the audit entry as acknowledged (`acknowledged_at`, `acknowledged_by`). Returns the updated entry. Returns 409 if already resolved.

`POST /admin/change-review/{audit_id}/undo` — admin only. Reverses the original operation: hard-deletes a CREATE record, restores `old_data` for an UPDATE, or clears `deleted_at` for a DELETE. Sets `undone_at`/`undone_by` on the audit entry. Does not create a new audit entry. Returns 409 if already resolved or if a FK violation prevents undo-CREATE.

`DELETE /admin/change-review/{audit_id}/permanent` — admin only. Hard-deletes the record referenced by a `DELETE` audit entry (confirms permanent deletion). Sets `undone_at`/`undone_by`. Returns 204. Returns 400 for non-DELETE entries, 409 if already resolved.
