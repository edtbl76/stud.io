# Admin Flows

## XLSX Export

```mermaid
sequenceDiagram
    participant Admin as Admin (Browser)
    participant BFF as Next.js BFF
    participant FastAPI as FastAPI Backend
    participant DB as PostgreSQL

    Admin->>BFF: GET /api/studio/admin/export/xlsx?tables=effects,instruments
    BFF->>FastAPI: GET /studio/admin/export/xlsx?tables=effects,instruments
    FastAPI->>FastAPI: require_admin resolved
    FastAPI->>DB: SELECT all lookup tables — build name→display maps
    loop For each requested table
        FastAPI->>DB: SELECT * FROM {table}_view WHERE deleted_at IS NULL
        DB-->>FastAPI: rows with all resolved display names
        FastAPI->>FastAPI: Build worksheet — one row per record, ID column included
    end
    FastAPI->>FastAPI: Add hidden _Lookups sheet with all valid values per column
    FastAPI-->>Admin: Stream .xlsx — Content-Disposition: attachment
```

---

## XLSX Import

```mermaid
sequenceDiagram
    participant Admin as Admin (Browser)
    participant BFF as Next.js BFF
    participant FastAPI as FastAPI Backend
    participant DB as PostgreSQL

    Admin->>BFF: POST /api/studio/admin/import/xlsx (multipart .xlsx, max 10 MB)
    BFF->>FastAPI: POST /studio/admin/import/xlsx
    FastAPI->>FastAPI: parse_workbook() — map sheet names to table keys, skip unknown/empty sheets
    FastAPI->>DB: SELECT all lookup tables — build name→UUID resolver maps

    note over FastAPI: Validate all rows first — no writes until all pass

    loop For each row across all sheets
        FastAPI->>FastAPI: Resolve lookup names to UUIDs (case-insensitive)
        alt Lookup name not found
            FastAPI->>FastAPI: difflib.get_close_matches — append "did you mean?" error
        end
    end

    alt Any validation errors
        FastAPI-->>Admin: 422 {errors: [{sheet, row, column, value, message}...]}
    else All rows valid
        loop For each row
            alt No ID cell — new record
                FastAPI->>DB: INSERT INTO {table} (...)
                FastAPI->>DB: INSERT INTO audit_log (operation=CREATE)
            else Has ID cell — update existing
                FastAPI->>DB: UPDATE {table} SET ... WHERE {pk}=$1 AND deleted_at IS NULL
                FastAPI->>DB: INSERT INTO audit_log (operation=UPDATE)
            end
        end
        FastAPI-->>Admin: {summary: [{sheet, creates, updates}], total_creates, total_updates}
    end
```

---

## pg_dump Backup

```mermaid
sequenceDiagram
    participant Admin as Admin (Browser)
    participant BFF as Next.js BFF
    participant FastAPI as FastAPI Backend
    participant DB as PostgreSQL

    Admin->>BFF: GET /api/studio/admin/backup
    BFF->>FastAPI: GET /studio/admin/backup + Bearer token
    FastAPI->>FastAPI: require_admin resolved
    FastAPI->>DB: SELECT COUNT(*) and MD5 hash per content table — build manifest
    FastAPI->>FastAPI: Spawn pg_dump subprocess against masterdb
    FastAPI->>FastAPI: Prepend manifest as SQL comment block at top of dump output
    FastAPI-->>Admin: Stream .sql file — Content-Disposition: attachment; filename=backup_{timestamp}.sql
```

---

## Backup Verify

```mermaid
sequenceDiagram
    participant Admin as Admin (Browser)
    participant BFF as Next.js BFF
    participant FastAPI as FastAPI Backend
    participant DB as PostgreSQL

    Admin->>BFF: POST /api/studio/admin/verify (multipart .sql upload)
    BFF->>FastAPI: POST /studio/admin/verify
    FastAPI->>FastAPI: Extract embedded manifest from SQL comment block
    alt No manifest found
        FastAPI-->>Admin: 400 — pre-manifest backup or wrong file
    else Manifest found
        FastAPI->>DB: CREATE DATABASE masterdb_verify_{uuid}
        FastAPI->>DB: Restore .sql to temp database via psql
        FastAPI->>DB: SELECT COUNT(*) and MD5 hash per table FROM masterdb_verify_{uuid}
        FastAPI->>FastAPI: Compare computed hashes against manifest values
        FastAPI->>DB: DROP DATABASE masterdb_verify_{uuid}
        FastAPI-->>Admin: {passed: bool, mismatches: [{table, expected, actual}...]}
    end
    note over FastAPI,DB: Unique database name per request — concurrent verifications do not interfere
```

---

## Backup Restore

```mermaid
sequenceDiagram
    participant Admin as Admin (Browser)
    participant BFF as Next.js BFF
    participant FastAPI as FastAPI Backend
    participant DB as PostgreSQL

    Admin->>BFF: POST /api/studio/admin/restore (multipart .sql upload)
    BFF->>FastAPI: POST /studio/admin/restore
    FastAPI->>FastAPI: require_admin resolved
    FastAPI->>FastAPI: Write upload to temp file
    FastAPI->>DB: Pipe .sql through psql against masterdb — object-level restore
    FastAPI->>FastAPI: Delete temp file
    FastAPI-->>Admin: 200 {message: "Restore complete"}

    note over FastAPI,DB: Destructive — existing objects overwritten. No DROP/CREATE of the database itself.
```
