-- U-02: scanner_rejections table
-- Persists rejected (fingerprint, record_id) pairings so bad matches
-- do not reappear on future workbench queries.
-- Idempotent: safe to apply to databases that already have the table.

CREATE TABLE IF NOT EXISTS scanner_rejections (
    rejection_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    fingerprint  TEXT        NOT NULL,
    record_id    UUID        NOT NULL,
    record_table TEXT        NOT NULL,
    confidence   TEXT        NOT NULL,
    rejected_by  TEXT        NOT NULL,
    rejected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (fingerprint, record_id)
);

CREATE INDEX IF NOT EXISTS idx_rejections_fingerprint
    ON scanner_rejections (fingerprint);
