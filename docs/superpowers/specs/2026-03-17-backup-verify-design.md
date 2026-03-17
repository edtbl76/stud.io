# Backup Verification Design

## Overview

Extend the existing backup/restore system to produce self-contained, verifiable backups. A backup embeds a content manifest (row counts + hashes per table) directly in the SQL file. A new verify endpoint restores the backup to a temporary database and confirms the restored data matches the manifest exactly.

---

## Goals

- Every backup is self-verifying: one file, all information needed to confirm fidelity
- Verification never risks live data: restore target is always a throwaway DB
- 100% confidence that a restore reproduces the exact data that was backed up
- Minimal UX change: same backup button, new verify section in the Admin UI

## Non-Goals

- Scheduled/automated backups
- Off-container backup storage (user manages this)
- Replacing the existing destructive restore (kept as-is for recovery scenarios)
- Concurrent verify requests — this is an admin-only single-user tool; simultaneous verify calls could corrupt each other's temp DB and are not a supported use case

---

## Manifest Format

The manifest is prepended to the SQL file as a structured comment block:

```sql
-- BACKUP MANIFEST BEGIN
-- {"created_at": "2026-03-17T14:30:00.123456", "database": "controlroomdb", "tables": {"brands": {"rows": 42, "hash": "a3f9c2..."}, "models": {"rows": 158, "hash": "7d1e44..."}, ...}}
-- BACKUP MANIFEST END

-- PostgreSQL database dump
...
```

**Fields:**
- `created_at` — `datetime.now().isoformat()` (local naive time, consistent with the existing filename timestamp behavior)
- `database` — source database name (`settings.db_name`)
- `tables` — one entry per public base table, keyed by table name:
  - `rows` — row count (int) at backup time
  - `hash` — content hash string (see Hash Query section); `null` for empty tables

The manifest is a single JSON line embedded in the comment so it is trivially parseable without a SQL parser. The `-- BACKUP MANIFEST BEGIN` / `-- BACKUP MANIFEST END` delimiters are the parse boundary. SQL comments are valid SQL — psql ignores them — so the manifest lines do not need to be stripped before restore. If stripping is implemented anyway, it must use a line-by-line approach matching only lines between the two delimiter lines inclusive; a loose regex risks matching other `--` comment lines.

---

## Hash Query

Per table:

```sql
SELECT
    COUNT(*)::int AS row_count,
    md5(string_agg(md5(t::text), ',' ORDER BY id)) AS content_hash
FROM {table_name} t
```

`t::text` casts the entire row to a deterministic text representation in PostgreSQL. `string_agg(...ORDER BY id)` ensures consistent ordering regardless of physical storage order. `md5(string_agg(...))` on an empty table returns `NULL` (because `string_agg` of zero rows is `NULL`), so `content_hash` is `null` in the manifest for empty tables.

**Schema assumption:** All public base tables in `controlroomdb` have a column named `id` (UUID primary key). This is true for every table in the current schema and must be maintained as a convention. The query will fail at runtime if a table without an `id` column is introduced.

Tables are discovered at runtime via:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name
```

---

## Backend Changes

### `_pg_args` helper (modified)

```python
def _pg_args(command: str, db_name: str | None = None) -> list[str]:
    return [
        command,
        "-h", settings.db_host,
        "-p", str(settings.db_port),
        "-U", settings.db_user,
        db_name or settings.db_name,
    ]
```

Default behavior (no `db_name`) is unchanged for the existing backup and restore endpoints. The verify endpoint uses:
- `_pg_args("psql", db_name="postgres")` for `CREATE DATABASE` / `DROP DATABASE` — these DDL statements **must** run against a database other than the target; `postgres` is the standard system database for this purpose
- `_pg_args("psql", db_name="controlroomdb_verify")` for the restore step

### `GET /admin/backup` (modified)

1. Run `pg_dump` as before (collect full stdout via `proc.communicate()`)
2. Open a new asyncpg connection using `await asyncpg.connect(dsn=settings.db_dsn)` (the existing DSN from config)
3. Query `information_schema.tables` to discover all public base tables
4. Run the hash query per table
5. Close the asyncpg connection
6. Build the manifest dict; serialize to JSON (single line, no extra whitespace)
7. Construct manifest bytes:
   ```
   b"-- BACKUP MANIFEST BEGIN\n-- " + json_bytes + b"\n-- BACKUP MANIFEST END\n\n"
   ```
8. Prepend manifest bytes to `stdout`
9. Stream as before

No change to filename format or response headers.

**Test note:** The two new backup tests (`test_backup_contains_manifest`, `test_backup_manifest_is_valid_json`) must patch both `asyncio.create_subprocess_exec` (for pg_dump) **and** `asyncpg.connect` (for the hash query). The existing backup tests only patch `asyncio.create_subprocess_exec` — this is a new pattern for this file.

### `POST /admin/verify` (new)

**Request:** multipart file upload (`.sql` file)

**Memory note:** The verify endpoint reads the entire file into memory (`await file.read()`), consistent with the existing restore endpoint. File size limits follow the existing deployment's FastAPI/uvicorn defaults. This is acceptable for the expected database sizes in this project.

**Process:**

```python
# Pseudocode — implementer writes the real version
async def verify(file: UploadFile, _: UserOut = Depends(require_admin)):
    if not file.filename or not file.filename.endswith(".sql"):
        raise HTTPException(400, "File must be a .sql file")

    sql_bytes = await file.read()
    manifest = _parse_manifest(sql_bytes)  # raises 400 if not found

    conn = None
    try:
        # 1. Drop any leftover temp DB from a previous aborted run
        await _run_psql_command("DROP DATABASE IF EXISTS controlroomdb_verify", db_name="postgres")

        # 2. Create fresh temp DB
        await _run_psql_command("CREATE DATABASE controlroomdb_verify", db_name="postgres")

        # 3. Restore backup into temp DB (manifest lines are valid SQL comments; no stripping needed)
        await _run_psql_restore(sql_bytes, db_name="controlroomdb_verify")

        # 4. Compute hashes against the restored DB
        verify_dsn = _build_verify_dsn()  # see DSN section below
        conn = await asyncpg.connect(dsn=verify_dsn)
        actual = await _compute_manifest(conn)

        # 5. Compare
        result = _compare_manifests(manifest, actual)
        return result

    finally:
        if conn:
            await conn.close()
        # Always clean up, even on exception
        await _run_psql_command("DROP DATABASE IF EXISTS controlroomdb_verify", db_name="postgres")
```

**Note on CREATE/DROP DATABASE:** PostgreSQL does not allow `CREATE DATABASE` or `DROP DATABASE` inside a transaction block. These statements must be executed via `psql` subprocess calls (not via the asyncpg pool, which operates in transaction context). The `_run_psql_command` helper runs:

```python
async def _run_psql_command(sql: str, db_name: str) -> None:
    proc = await asyncio.create_subprocess_exec(
        *(_pg_args("psql", db_name=db_name) + ["-c", sql]),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=_pg_env(),
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise HTTPException(500, stderr.decode())
```

**Constructing the verify DSN:**

The existing `settings.db_dsn` targets `settings.db_name` (`controlroomdb`). The asyncpg connection for hash computation must target `controlroomdb_verify`. Build this as:

```python
def _build_verify_dsn() -> str:
    return (
        f"postgresql://{settings.db_user}:{settings.db_password}"
        f"@{settings.db_host}:{settings.db_port}/controlroomdb_verify"
    )
```

This mirrors how `settings.db_dsn` is assembled in `config.py`, but targets the temp database by name.

**Manifest parsing:**

```python
def _parse_manifest(sql_bytes: bytes) -> dict:
    lines = sql_bytes.decode(errors="replace").splitlines()
    in_block = False
    for line in lines:
        if line == "-- BACKUP MANIFEST BEGIN":
            in_block = True
            continue
        if line == "-- BACKUP MANIFEST END":
            break
        if in_block and line.startswith("-- "):
            try:
                return json.loads(line[3:])
            except json.JSONDecodeError:
                pass
    raise HTTPException(400, "No valid manifest found. Re-download a fresh backup to enable verification.")
```

**Response (200):**
```json
{
  "passed": true,
  "created_at": "2026-03-17T14:30:00.123456",
  "tables": [
    {"table": "brands",  "rows_expected": 42,  "rows_actual": 42,  "hash_match": true,  "passed": true},
    {"table": "models",  "rows_expected": 158, "rows_actual": 158, "hash_match": true,  "passed": true}
  ]
}
```

`passed` at the top level is `true` only if all table-level `passed` fields are `true`.

**Error responses:**
- `400` — not a `.sql` file, no filename, or no valid manifest found in file
- `500` — subprocess failure (CREATE/DROP/restore) or asyncpg failure; detail included in response

---

## Frontend Changes

### TypeScript interface

Define at the top of `page.tsx` alongside the existing `Status` type:

```typescript
interface VerifyTableResult {
  table: string
  rows_expected: number
  rows_actual: number
  hash_match: boolean
  passed: boolean
}

interface VerifyResult {
  passed: boolean
  created_at: string
  tables: VerifyTableResult[]
}
```

### `app/admin/backup/page.tsx` (modified)

Add a third section below Restore: **Verify Backup**.

State additions:
```typescript
const [verifyFile, setVerifyFile] = React.useState<File | null>(null)
const [verifyLoading, setVerifyLoading] = React.useState(false)
const [verifyResult, setVerifyResult] = React.useState<VerifyResult | null>(null)
const [verifyError, setVerifyError] = React.useState<string | null>(null)
const verifyFileRef = React.useRef<HTMLInputElement>(null)
```

UI behaviour:
- File input (`.sql` only), separate `ref` from the restore file input
- "Verify" button — disabled when no file selected **or** while `verifyLoading` is true
- Loading state with spinner (button disabled, spinner shown — same pattern as backup/restore)
- On 400 (no manifest): show `"This file was not created with manifest support. Re-download a fresh backup to enable verification."`
- On 500 or network error: show standard error message
- On 200 with `passed: true`: show green PASSED badge + table (all rows green)
- On 200 with `passed: false`: show red FAILED badge + table; failed rows highlighted in red

Result table columns: Table | Expected rows | Actual rows | Hash | Status

---

## Testing

### Backend (`tests/test_admin.py`) — 11 new tests

**Backup tests (2 new):**
- `test_backup_contains_manifest` — response body contains `b"-- BACKUP MANIFEST BEGIN"`; patches both `asyncio.create_subprocess_exec` and `asyncpg.connect`
- `test_backup_manifest_is_valid_json` — extracts the manifest line, parses as JSON, asserts keys `created_at`, `database`, `tables` are present; same mocks as above

**Verify tests (9 new):**
- `test_verify_requires_auth` — no token → 401 (tests the unauthenticated case, consistent with `test_backup_requires_auth`)
- `test_verify_requires_admin` — regular-user token → 403 (tests the authenticated non-admin case)
- `test_verify_rejects_non_sql` — `.txt` extension → 400
- `test_verify_rejects_missing_filename` — no filename → 400
- `test_verify_rejects_missing_manifest` — valid `.sql` file with no manifest block → 400
- `test_verify_passes_on_matching_hashes` — mocked restore + matching hash query → 200, `passed: true`, all tables pass
- `test_verify_fails_on_mismatched_hash` — mocked restore + hash mismatch on one table → 200, `passed: false`, correct table flagged
- `test_verify_fails_on_mismatched_rowcount` — row count differs → 200, `passed: false`
- `test_verify_psql_failure_returns_500` — psql restore fails → 500
- `test_verify_cleanup_on_failure` — psql restore fails → DROP DATABASE still called (verify finally block runs)
- `test_verify_roundtrip` — backup response (with mocked pg_dump and asyncpg) feeds directly into verify (with mocked psql and asyncpg) → 200, `passed: true`. **Note:** this test is fully mocked end-to-end; it validates that backup and verify cooperate on the manifest format, not that real data is preserved.

**Mocking pattern for verify tests:** patch `asyncio.create_subprocess_exec` for subprocess calls and `asyncpg.connect` for the hash computation connection. Each mock of `asyncpg.connect` returns a mock connection with a `fetch` method returning the expected table rows.

### Frontend (`__tests__/app/admin/backup/page.test.tsx`) — 8 new tests

- Verify section renders with disabled button when no file selected
- Verify button enabled after file selected
- Verify button disabled while request is in progress (loading state)
- Loading spinner shown during verify
- Pass result: PASSED badge rendered, result table visible
- Fail result: FAILED badge rendered
- Error result (500): error message shown
- 400 (no manifest): "Re-download a fresh backup" message shown

---

## Coverage Notes

All subprocess calls and asyncpg connections in the new code will be mocked in tests. The `_parse_manifest` function and `_compare_manifests` function are pure Python — testable directly without mocks. The `_build_verify_dsn` function is also pure and can be tested without mocks.

The verify UI section follows the same component patterns as the existing backup/restore sections — fully testable via Jest mocks of `fetch`. No coverage exclusions needed.

---

## Files Changed

| File | Change |
|---|---|
| `app/controlroom_backend/routers/admin_ops.py` | Modify backup to embed manifest; add `_parse_manifest`, `_build_verify_dsn`, `_run_psql_command`, `_compute_manifest` helpers; add verify endpoint; modify `_pg_args` |
| `app/controlroom_frontend/app/admin/backup/page.tsx` | Add `VerifyResult`/`VerifyTableResult` interfaces; add Verify section |
| `app/controlroom_backend/tests/test_admin.py` | 11 new tests |
| `app/controlroom_frontend/__tests__/app/admin/backup/page.test.tsx` | 8 new tests |
| `docs/arch/api.md` | Add `POST /admin/verify` to the router table |
