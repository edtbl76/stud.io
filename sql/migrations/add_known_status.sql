-- Migration: add 'known' status value and backfill matched results with catalog disk_paths

ALTER TABLE plugin_scan_results DROP CONSTRAINT IF EXISTS plugin_scan_results_status_check;

-- Rename version_mismatch → conflicted (no-op if rename migration already ran)
UPDATE plugin_scan_results SET status = 'conflicted' WHERE status = 'version_mismatch';

UPDATE plugin_scan_results r SET status = 'known'
WHERE r.status = 'matched' AND r.record_id IS NOT NULL AND (
    (r.record_table = 'effects'            AND EXISTS (SELECT 1 FROM effects            WHERE effect_id = r.record_id            AND disk_paths != '[]'::jsonb AND deleted_at IS NULL))
    OR (r.record_table = 'instruments'     AND EXISTS (SELECT 1 FROM instruments        WHERE instrument_id = r.record_id        AND disk_paths != '[]'::jsonb AND deleted_at IS NULL))
    OR (r.record_table = 'workstations'    AND EXISTS (SELECT 1 FROM workstations       WHERE workstation_id = r.record_id       AND disk_paths != '[]'::jsonb AND deleted_at IS NULL))
    OR (r.record_table = 'workflow_tools'  AND EXISTS (SELECT 1 FROM workflow_tools     WHERE workflow_tool_id = r.record_id     AND disk_paths != '[]'::jsonb AND deleted_at IS NULL))
    OR (r.record_table = 'measurement_tools' AND EXISTS (SELECT 1 FROM measurement_tools WHERE measurement_tool_id = r.record_id  AND disk_paths != '[]'::jsonb AND deleted_at IS NULL))
    OR (r.record_table = 'reference_tools' AND EXISTS (SELECT 1 FROM reference_tools   WHERE reference_tool_id = r.record_id   AND disk_paths != '[]'::jsonb AND deleted_at IS NULL))
    OR (r.record_table = 'composition_tools' AND EXISTS (SELECT 1 FROM composition_tools WHERE composition_tool_id = r.record_id AND disk_paths != '[]'::jsonb AND deleted_at IS NULL))
    OR (r.record_table = 'admin_tools'     AND EXISTS (SELECT 1 FROM admin_tools        WHERE admin_tool_id = r.record_id        AND disk_paths != '[]'::jsonb AND deleted_at IS NULL))
    OR (r.record_table = 'libraries'       AND EXISTS (SELECT 1 FROM libraries          WHERE library_id = r.record_id           AND disk_paths != '[]'::jsonb AND deleted_at IS NULL))
);
