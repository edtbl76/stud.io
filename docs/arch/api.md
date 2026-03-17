# API

## Overview

The backend is a [FastAPI](https://fastapi.tiangolo.com/) application running on Python 3.12 with [asyncpg](https://github.com/MagicStack/asyncpg) for async PostgreSQL access.

- Base URL: `https://localhost:5150`
- Interactive docs: `https://localhost:5150/docs` (Swagger UI)
- All endpoints require a JWT bearer token except `/auth/login` and `/health`

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
| `/admin` | `routers/admin_ops.py` | Database backup, restore, and verification |
| `/users` | `routers/users.py` | User management (admin only) |

---

## Authentication

JWT-based. Tokens are signed with HS256 using `JWT_SECRET` and expire after `JWT_EXPIRE_MINUTES` (default 8 hours).

**Login flow:**
1. `POST /auth/login` with `{username, password}` → returns `{access_token, token_type}`
2. All subsequent requests include `Authorization: Bearer <token>`

**Google Sign-In flow:**
1. Frontend renders the Google Identity button (requires `NEXT_PUBLIC_GOOGLE_CLIENT_ID`)
2. Google returns a credential (ID token) to the frontend callback
3. Frontend sends the ID token to `POST /auth/google` → backend verifies it and returns a JWT
4. If no account is linked to that Google ID, the request is rejected (user must be created and linked by an admin first)

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
