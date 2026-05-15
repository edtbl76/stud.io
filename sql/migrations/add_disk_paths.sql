-- Migration: add disk_paths JSONB to all plugin catalog tables
-- Each entry is a tuple: {path: text, format: vst3|au|vst2, version: text}
-- Manual-only field — never auto-populated by scanner confirmation.

ALTER TABLE effects           ADD COLUMN IF NOT EXISTS disk_paths JSONB NOT NULL DEFAULT '[]';
ALTER TABLE instruments       ADD COLUMN IF NOT EXISTS disk_paths JSONB NOT NULL DEFAULT '[]';
ALTER TABLE workstations      ADD COLUMN IF NOT EXISTS disk_paths JSONB NOT NULL DEFAULT '[]';
ALTER TABLE workflow_tools    ADD COLUMN IF NOT EXISTS disk_paths JSONB NOT NULL DEFAULT '[]';
ALTER TABLE measurement_tools ADD COLUMN IF NOT EXISTS disk_paths JSONB NOT NULL DEFAULT '[]';
ALTER TABLE reference_tools   ADD COLUMN IF NOT EXISTS disk_paths JSONB NOT NULL DEFAULT '[]';
ALTER TABLE composition_tools ADD COLUMN IF NOT EXISTS disk_paths JSONB NOT NULL DEFAULT '[]';
ALTER TABLE admin_tools       ADD COLUMN IF NOT EXISTS disk_paths JSONB NOT NULL DEFAULT '[]';
ALTER TABLE libraries         ADD COLUMN IF NOT EXISTS disk_paths JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_effects_disk_paths           ON effects           USING GIN (disk_paths);
CREATE INDEX IF NOT EXISTS idx_instruments_disk_paths       ON instruments       USING GIN (disk_paths);
CREATE INDEX IF NOT EXISTS idx_workstations_disk_paths      ON workstations      USING GIN (disk_paths);
CREATE INDEX IF NOT EXISTS idx_workflow_tools_disk_paths    ON workflow_tools    USING GIN (disk_paths);
CREATE INDEX IF NOT EXISTS idx_measurement_tools_disk_paths ON measurement_tools USING GIN (disk_paths);
CREATE INDEX IF NOT EXISTS idx_reference_tools_disk_paths   ON reference_tools   USING GIN (disk_paths);
CREATE INDEX IF NOT EXISTS idx_composition_tools_disk_paths ON composition_tools USING GIN (disk_paths);
CREATE INDEX IF NOT EXISTS idx_admin_tools_disk_paths       ON admin_tools       USING GIN (disk_paths);
CREATE INDEX IF NOT EXISTS idx_libraries_disk_paths         ON libraries         USING GIN (disk_paths);
