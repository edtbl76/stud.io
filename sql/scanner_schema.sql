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
    total_count    INT         NOT NULL CHECK (total_count >= 0)
);

-- One row per discovered plugin per scan run.
-- Cascade-deleted when the parent scan is deleted (log data, not catalog data).
CREATE TABLE IF NOT EXISTS plugin_scan_results (
    result_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id      UUID        NOT NULL REFERENCES plugin_scans(scan_id) ON DELETE CASCADE,
    name         TEXT        NOT NULL,
    vendor       TEXT        NOT NULL,
    version      TEXT        NOT NULL,
    format       TEXT        NOT NULL CHECK (format IN ('vst3', 'au', 'vst2')),
    path         TEXT        NOT NULL,
    status       TEXT        NOT NULL CHECK (status IN ('known', 'matched', 'conflicted', 'unconfirmed', 'untracked', 'orphaned', 'ignored')),
    confidence   TEXT        CHECK (confidence IN ('exact', 'high', 'medium', 'low', 'none')),
    score        NUMERIC(5,2) CHECK (score BETWEEN 0 AND 100),
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

-- Persistent confirmed match links.
-- Survives scan history purges — one link per scanned plugin fingerprint.
-- Created on confirm, deleted on reject.
CREATE TABLE IF NOT EXISTS scanner_plugin_links (
    link_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    scanned_vendor TEXT        NOT NULL,
    scanned_name   TEXT        NOT NULL,
    fingerprint    TEXT        NOT NULL,   -- "{vendor} {name}".lower().strip()
    record_id      UUID        NOT NULL,
    record_table   TEXT        NOT NULL,
    confirmed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_by   TEXT        NOT NULL,
    UNIQUE (fingerprint)
);

-- U-04 additions (idempotent) -----------------------------------------------

-- Orphan dismiss: per-scan-run flag; does not affect future scan results.
ALTER TABLE plugin_scan_results ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

-- Permanent keep: suppresses orphan flagging for a confirmed link in all future scans.
ALTER TABLE scanner_plugin_links ADD COLUMN IF NOT EXISTS keep_permanently BOOLEAN NOT NULL DEFAULT FALSE;

-- =============================================================================
-- Plugin Scanner Rules Engine (U-01 rewrite)
-- =============================================================================

CREATE TABLE IF NOT EXISTS scanner_vendor_rules (
    rule_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    disk_vendor    TEXT        NOT NULL,
    catalog_vendor TEXT        NOT NULL,
    enabled        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_by     TEXT        NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (disk_vendor)
);

CREATE TABLE IF NOT EXISTS scanner_name_rules (
    rule_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    disk_name     TEXT        NOT NULL,
    catalog_name  TEXT        NOT NULL,
    enabled       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_by    TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (disk_name)
);

CREATE TABLE IF NOT EXISTS scanner_name_patterns (
    rule_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    label        TEXT        NOT NULL,
    pattern      TEXT        NOT NULL,
    match_fields TEXT[]      NOT NULL,
    action       TEXT        NOT NULL CHECK (action IN ('alias_to_match')),
    enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
    is_seeded    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by   TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scanner_name_aliases (
    alias_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    disk_name         TEXT        NOT NULL,
    catalog_record_id UUID        NOT NULL,
    catalog_table     TEXT        NOT NULL,
    created_by        TEXT        NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (disk_name)
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

-- scanner_vendor_rules: workbench JOIN on disk_vendor
CREATE INDEX IF NOT EXISTS idx_vendor_rules_disk_vendor
    ON scanner_vendor_rules (disk_vendor);

-- scanner_name_rules: workbench JOIN on disk_name
CREATE INDEX IF NOT EXISTS idx_name_rules_disk_name
    ON scanner_name_rules (disk_name);

-- scanner_name_patterns: filter active rules before Python evaluation
CREATE INDEX IF NOT EXISTS idx_name_patterns_enabled
    ON scanner_name_patterns (enabled);

-- scanner_name_aliases: alias lookup at ingest time
CREATE INDEX IF NOT EXISTS idx_name_aliases_disk_name
    ON scanner_name_aliases (disk_name);
