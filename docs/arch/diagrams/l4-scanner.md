# Scanner Flows

## API Key Creation

```mermaid
sequenceDiagram
    participant Admin as Admin (Browser)
    participant BFF as Next.js BFF
    participant FastAPI as FastAPI Backend
    participant DB as PostgreSQL

    Admin->>BFF: POST /api/scanner/keys {label}
    BFF->>FastAPI: POST /scanner/keys + Bearer token
    FastAPI->>FastAPI: require_admin resolved
    FastAPI->>FastAPI: Generate plaintext key — "psc_" + 64 random hex chars
    FastAPI->>FastAPI: bcrypt hash the plaintext key
    FastAPI->>DB: INSERT INTO scanner_api_keys (label, key_hint=last_4_chars, hashed_key, created_at)
    DB-->>FastAPI: {key_id, label, key_hint, created_at}
    FastAPI-->>Admin: {key_id, label, key_hint, key: "psc_..."} — plaintext returned once only

    note over Admin,FastAPI: Plaintext is never stored — only the bcrypt hash and 4-char hint are persisted
```

---

## Scan Ingest

```mermaid
sequenceDiagram
    participant Binary as plugin-scanner (macOS)
    participant BFF as Next.js BFF
    participant FastAPI as FastAPI Backend
    participant DB as PostgreSQL

    Binary->>Binary: Walk scan_paths — find .vst3 / .component / .vst bundles
    Binary->>Binary: Extract name, vendor, version, format, path per bundle
    Binary->>BFF: POST /api/scanner/scan (Authorization: Bearer psc_...) {plugins[], source_machine}
    BFF->>FastAPI: POST /scanner/scan — API key forwarded as-is, no cookie involved
    FastAPI->>FastAPI: Validate API key — bcrypt compare against scanner_api_keys
    FastAPI->>DB: INSERT INTO plugin_scans — creates scan run record
    FastAPI->>DB: SELECT active rules from scanner_vendor_rules, scanner_name_rules, scanner_name_patterns
    FastAPI->>DB: SELECT persistent links from scanner_plugin_links
    FastAPI->>DB: Build catalog index (effects / instruments / workstations / tools UNION)
    FastAPI->>DB: SELECT exclusions from scanner_exclusions
    loop For each plugin
        FastAPI->>FastAPI: Apply vendor and name normalization rules
        FastAPI->>FastAPI: Check persistent links — mark known/orphaned, skip matching if fingerprint known
        FastAPI->>FastAPI: Tier 1 — exact fingerprint match
        FastAPI->>FastAPI: Tier 2 — fuzzy vendor+name (rapidfuzz)
        FastAPI->>FastAPI: Tier 3 — fuzzy name-only
        FastAPI->>FastAPI: Assign status: known / matched / conflicted / unconfirmed / untracked / excluded
    end
    FastAPI->>DB: INSERT INTO plugin_scan_results (bulk executemany)
    FastAPI->>DB: INSERT orphaned rows for confirmed links not seen in this scan
    FastAPI-->>Binary: ScanSummary {scan_id, known, matched, conflicted, unconfirmed, untracked, orphaned, excluded}
    Binary->>Binary: Render terminal summary or --json output
```

---

## Confirmation Actions

```mermaid
sequenceDiagram
    participant Admin as Studio Owner (Browser)
    participant BFF as Next.js BFF
    participant FastAPI as FastAPI Backend
    participant DB as PostgreSQL

    Admin->>BFF: POST /api/scanner/confirm [{result_id, action, target_id?, target_table?}]
    BFF->>FastAPI: POST /scanner/confirm

    loop For each item — errors isolated, one failure does not roll back others
        FastAPI->>DB: SELECT result row — name, vendor, version, format, path, record_id, record_table
        alt action = confirm
            FastAPI->>DB: UPDATE plugin_scan_results SET status=matched, confirmed_at=NOW()
            FastAPI->>DB: UPDATE {catalog_table} SET version=disk_version
            FastAPI->>DB: UPSERT scanner_plugin_links (fingerprint → record)
        else action = acknowledge
            FastAPI->>DB: UPDATE plugin_scan_results SET confirmed_at=NOW()
            FastAPI->>DB: UPSERT scanner_plugin_links
            FastAPI->>DB: Append {path, format, version} to {catalog_table}.disk_paths JSONB
        else action = reject
            FastAPI->>DB: UPDATE plugin_scan_results SET status=untracked, record_id=NULL
            FastAPI->>DB: DELETE FROM scanner_plugin_links WHERE fingerprint=$fp
        else action = ignore
            FastAPI->>DB: INSERT INTO scanner_exclusions (vendor, name) ON CONFLICT DO NOTHING
            FastAPI->>DB: UPDATE plugin_scan_results SET status=excluded
        else action = create
            FastAPI->>DB: INSERT INTO {target_table} (name, vendor, version) RETURNING id
            FastAPI->>DB: UPDATE plugin_scan_results SET status=matched, record_id=new_id
            FastAPI->>DB: UPSERT scanner_plugin_links
        else action = force
            FastAPI->>DB: UPDATE plugin_scan_results SET record_id=target_id
            FastAPI->>DB: UPSERT scanner_plugin_links
        end
    end

    FastAPI-->>Admin: {applied: N, errors: [...]}
    Admin->>Admin: invalidateQueries — scanner report refetches
```

---

## Release Download

```mermaid
sequenceDiagram
    participant Browser
    participant BFF as Next.js BFF
    participant MinIO

    Browser->>BFF: GET /api/scanner/download/latest
    BFF->>BFF: Validate session cookie
    BFF->>MinIO: ListObjectsV2 — Bucket: studio-downloads, Prefix: plugin-scanner/
    MinIO-->>BFF: [{Key, LastModified, Size}...]
    BFF->>BFF: Sort by LastModified desc — parse version from filename
    BFF-->>Browser: {key, version, released_at, size_bytes}

    Browser->>Browser: User clicks Download
    Browser->>BFF: GET /api/scanner/download/url?key={object-key}
    BFF->>BFF: Validate session cookie
    BFF->>MinIO: GetObject — stream zip bytes
    MinIO-->>BFF: object body stream + ContentLength
    BFF-->>Browser: stream — Content-Disposition: attachment; filename=plugin-scanner-{version}.zip
```
