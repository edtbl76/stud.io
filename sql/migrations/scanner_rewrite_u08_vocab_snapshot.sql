-- =============================================================================
-- Scanner Rewrite U-08: Vocabulary Frozen-Snapshot
--
-- Tightens plugin_scan_results.status to the frozen five-bucket vocabulary
-- (known, needs_review, unlinked, orphaned, excluded) and removes the retired
-- legacy values (matched, conflicted, unconfirmed, untracked, ignored).
--
-- Hard cutover (FR-14, Q6): scan results are re-runnable logs, so existing
-- rows are WIPED, not migrated — the next scan repopulates with new-vocabulary
-- status. plugin_scans run headers are wiped too (a run with no results is
-- meaningless). Rules, links, aliases, and exclusions are preserved.
--
-- Idempotent: safe to re-run after partial failure.
-- =============================================================================

BEGIN;

-- 1. Wipe scan-result rows and their run headers (clean slate — not migrated).
DELETE FROM plugin_scan_results;
DELETE FROM plugin_scans;

-- 2. Tighten the status CHECK to the five frozen-snapshot values.
ALTER TABLE plugin_scan_results
    DROP CONSTRAINT IF EXISTS plugin_scan_results_status_check;
ALTER TABLE plugin_scan_results
    ADD CONSTRAINT plugin_scan_results_status_check
    CHECK (status IN ('known', 'needs_review', 'unlinked', 'orphaned', 'excluded'));

COMMIT;
