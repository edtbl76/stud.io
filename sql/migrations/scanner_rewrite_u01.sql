-- =============================================================================
-- Scanner Rewrite U-01: Rule Tables & Status Extension
--
-- Adds four new rule tables for the Plugin Scanner Rules engine.
-- Extends plugin_scan_results.status CHECK to include new five-bucket values
-- while retaining legacy values for the coexistence period (removed in U-05).
-- Seeds the Mono Variant name pattern rule (disabled by default).
--
-- Idempotent: safe to re-run after partial failure.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- New rule tables
-- -----------------------------------------------------------------------------

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

-- -----------------------------------------------------------------------------
-- Extend plugin_scan_results.status CHECK constraint
-- DROP then ADD in same transaction — no window without constraint coverage.
-- Retains legacy values for coexistence period (removed in U-05 cleanup).
-- -----------------------------------------------------------------------------

ALTER TABLE plugin_scan_results
    DROP CONSTRAINT IF EXISTS plugin_scan_results_status_check;

ALTER TABLE plugin_scan_results
    ADD CONSTRAINT plugin_scan_results_status_check
    CHECK (status IN (
        'known', 'matched', 'conflicted', 'unconfirmed', 'untracked', 'orphaned', 'ignored',
        'unlinked', 'needs_review', 'excluded'
    ));

-- -----------------------------------------------------------------------------
-- Indexes for workbench JOIN queries
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_vendor_rules_disk_vendor
    ON scanner_vendor_rules (disk_vendor);

CREATE INDEX IF NOT EXISTS idx_name_rules_disk_name
    ON scanner_name_rules (disk_name);

CREATE INDEX IF NOT EXISTS idx_name_patterns_enabled
    ON scanner_name_patterns (enabled);

CREATE INDEX IF NOT EXISTS idx_name_aliases_disk_name
    ON scanner_name_aliases (disk_name);

-- -----------------------------------------------------------------------------
-- Seed data: Mono Variant pattern rule (disabled by default)
-- -----------------------------------------------------------------------------

INSERT INTO scanner_name_patterns
    (label, pattern, match_fields, action, enabled, is_seeded, created_by)
VALUES
    ('Mono variant', '{name}(m)', '{vendor,version,format}', 'alias_to_match', FALSE, TRUE, 'system')
ON CONFLICT DO NOTHING;

COMMIT;
