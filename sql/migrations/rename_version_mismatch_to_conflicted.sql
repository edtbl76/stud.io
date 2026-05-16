-- Migration: rename status value 'version_mismatch' to 'conflicted' in plugin_scan_results
-- Safe to re-run: UPDATE is a no-op when no rows match; DROP/ADD is idempotent via IF NOT EXISTS pattern.

ALTER TABLE plugin_scan_results DROP CONSTRAINT IF EXISTS plugin_scan_results_status_check;
UPDATE plugin_scan_results SET status = 'conflicted' WHERE status = 'version_mismatch';
ALTER TABLE plugin_scan_results ADD CONSTRAINT plugin_scan_results_status_check
    CHECK (status IN ('known', 'matched', 'conflicted', 'unconfirmed', 'untracked', 'orphaned', 'ignored'));
