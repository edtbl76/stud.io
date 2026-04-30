-- =============================================================================
-- STUD.io Plugin Scanner Schema
-- Idempotent: all statements use IF NOT EXISTS / DO NOTHING.
-- Applied after sql/gearlist_schema.sql and before sql/views.sql.
-- =============================================================================

-- One row per scan run uploaded by the plugin-scanner binary.
CREATE TABLE IF NOT EXISTS plugin_scans (
    scan_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scanned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_machine TEXT        NOT NULL,
    total_count    INT         NOT NULL
);

-- One row per discovered plugin per scan run.
-- Cascade-deleted when the parent scan is deleted (log data, not catalog data).
CREATE TABLE IF NOT EXISTS plugin_scan_results (
    result_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id      UUID        NOT NULL REFERENCES plugin_scans(scan_id) ON DELETE CASCADE,
    name         TEXT        NOT NULL,
    vendor       TEXT        NOT NULL,
    version      TEXT        NOT NULL,
    format       TEXT        NOT NULL,   -- vst3 | au | vst2
    path         TEXT        NOT NULL,
    status       TEXT        NOT NULL,   -- matched | version_mismatch | unconfirmed | untracked | orphaned
    confidence   TEXT,                   -- exact | high | medium | low | none
    score        NUMERIC(5,2),           -- 0.00–100.00; NULL for exact matches and unmatched
    record_id    UUID,                   -- matched ControlRoom record (soft ref, no FK — table is dynamic)
    record_table TEXT,                   -- effects | instruments | ...
    confirmed_at TIMESTAMPTZ,
    confirmed_by TEXT
);

-- API keys used by the plugin-scanner binary to authenticate with ControlRoom.
-- Plaintext key is never stored — only the bcrypt hash and a 4-char hint.
CREATE TABLE IF NOT EXISTS scanner_api_keys (
    key_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    label       TEXT        NOT NULL,
    key_hint    TEXT        NOT NULL,               -- last 4 chars of plaintext key
    hashed_key  TEXT        NOT NULL UNIQUE,        -- bcrypt hash
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at  TIMESTAMPTZ DEFAULT NULL
);

-- Plugins excluded from all future scan reports.
-- UNIQUE on (vendor, name) prevents duplicate exclusions.
CREATE TABLE IF NOT EXISTS scanner_exclusions (
    exclusion_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor       TEXT        NOT NULL,
    name         TEXT        NOT NULL,
    excluded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vendor, name)
);

-- Indexes -------------------------------------------------------------------

-- plugin_scan_results: report query by scan run
CREATE INDEX IF NOT EXISTS idx_scan_results_scan_id
    ON plugin_scan_results (scan_id);

-- plugin_scan_results: report query filtered by status within a scan
CREATE INDEX IF NOT EXISTS idx_scan_results_scan_status
    ON plugin_scan_results (scan_id, status);

-- plugin_scans: purge query by date (DELETE WHERE scanned_at < $1)
CREATE INDEX IF NOT EXISTS idx_scans_scanned_at
    ON plugin_scans (scanned_at);
