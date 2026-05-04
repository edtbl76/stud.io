-- Migration: add dismissed_at to plugin_scan_results and keep_permanently to scanner_plugin_links
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

ALTER TABLE plugin_scan_results ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
ALTER TABLE scanner_plugin_links ADD COLUMN IF NOT EXISTS keep_permanently BOOLEAN NOT NULL DEFAULT FALSE;
