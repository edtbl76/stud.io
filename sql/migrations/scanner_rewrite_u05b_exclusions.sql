-- U-05b: scanner_exclusions — track who excluded a plugin and in what format.
-- Idempotent: safe to apply to databases that already have these columns.

ALTER TABLE scanner_exclusions ADD COLUMN IF NOT EXISTS excluded_by TEXT;
ALTER TABLE scanner_exclusions ADD COLUMN IF NOT EXISTS format TEXT;
