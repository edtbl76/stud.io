-- =============================================================================
-- STUD.io GearList Schema
-- Idempotent: all statements use IF NOT EXISTS.
-- Applied after sql/views.sql so gear_view can be added to views.sql safely.
-- =============================================================================

CREATE TABLE IF NOT EXISTS gear_types (
    type_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name        TEXT NOT NULL UNIQUE,
    type_description TEXT,
    deleted_at       TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS gear (
    gear_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gear_name              TEXT NOT NULL,
    gear_type_id           UUID REFERENCES gear_types(type_id),
    brand_id               UUID,
    model_id               UUID,
    serial_number          TEXT,
    year                   INT,
    owner_id               UUID,
    photo_key              TEXT,
    notes                  TEXT,
    num_strings            INT,
    tuning                 TEXT,
    pickup_config          TEXT,
    pickup_neck_model_id   UUID,
    pickup_middle_model_id UUID,
    pickup_bridge_model_id UUID,
    strings_model_id       UUID,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at             TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS gear_maintenance_log (
    log_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gear_id    UUID NOT NULL REFERENCES gear(gear_id),
    event_type TEXT NOT NULL CHECK (event_type IN ('restring','setup','repair','modification','other')),
    notes      TEXT,
    event_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gear_gear_type_id ON gear (gear_type_id);
CREATE INDEX IF NOT EXISTS idx_gear_owner_id     ON gear (owner_id);
CREATE INDEX IF NOT EXISTS idx_gear_name_trgm    ON gear USING gin (gear_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_maintenance_gear  ON gear_maintenance_log (gear_id, event_date DESC);
