-- =============================================================================
-- STUD.io ControlRoom — Schema
-- Tables are added incrementally as each is properly designed
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TABLE entity_types (
    type_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name        TEXT NOT NULL UNIQUE,
    type_description TEXT
);
CREATE TYPE parent_ref AS (table_name TEXT, id UUID);
CREATE TABLE tool_types (
    type_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name        TEXT NOT NULL UNIQUE,
    type_description TEXT
);
CREATE TABLE plugin_formats (
    type_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name        TEXT NOT NULL UNIQUE,
    type_description TEXT
);
CREATE TABLE tag_types (
    type_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name        TEXT NOT NULL UNIQUE,
    type_description TEXT
);

-- =============================================================================
-- BRANDS
-- Companies, recording studios, and individual builders associated with gear
-- =============================================================================
CREATE TABLE brands (
    brand_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name       TEXT,
    brand_name       TEXT NOT NULL,
    entity_type_id   UUID REFERENCES entity_types(type_id),
    website          TEXT,
    description      TEXT,
    founder          TEXT,
    years            TEXT,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- WORKSTATIONS
-- DAWs and mastering suites — the primary hosts for production
-- =============================================================================
CREATE TABLE workstations (
    workstation_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id          UUID REFERENCES brands(brand_id),
    tool_name         TEXT NOT NULL,
    version           TEXT,
    tool_type_ids     UUID[],
    plugin_format_ids UUID[],
    description       TEXT,
    workflow_notes    TEXT,
    tag_ids           UUID[],
    disk_paths        JSONB NOT NULL DEFAULT '[]',
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- MEASUREMENT TOOLS
-- Meters, analyzers, and diagnostic applications
-- =============================================================================
CREATE TABLE measurement_tools (
    measurement_tool_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id             UUID REFERENCES brands(brand_id),
    model_ids            UUID[],
    tool_name            TEXT NOT NULL,
    version              TEXT,
    tool_type_ids        UUID[],
    plugin_format_ids    UUID[],
    description          TEXT,
    workflow_notes       TEXT,
    tag_ids              UUID[],
    disk_paths           JSONB NOT NULL DEFAULT '[]',
    created_at           TIMESTAMP DEFAULT NOW(),
    updated_at           TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- REFERENCE TOOLS
-- Room correction, headphone reference, and monitoring plugins
-- =============================================================================
CREATE TABLE reference_tools (
    reference_tool_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id           UUID REFERENCES brands(brand_id),
    model_ids          UUID[],
    tool_name          TEXT NOT NULL,
    version            TEXT,
    tool_type_ids      UUID[],
    plugin_format_ids  UUID[],
    description        TEXT,
    workflow_notes     TEXT,
    tag_ids            UUID[],
    disk_paths         JSONB NOT NULL DEFAULT '[]',
    created_at         TIMESTAMP DEFAULT NOW(),
    updated_at         TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- WORKFLOW TOOLS
-- Recommendable standalone studio utilities (routing, browsing, editing)
-- =============================================================================
CREATE TABLE workflow_tools (
    workflow_tool_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id          UUID REFERENCES brands(brand_id),
    tool_name         TEXT NOT NULL,
    version           TEXT,
    tool_type_ids     UUID[],
    plugin_format_ids UUID[],
    description       TEXT,
    workflow_notes    TEXT,
    tag_ids           UUID[],
    disk_paths        JSONB NOT NULL DEFAULT '[]',
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- COMPOSITION TOOLS
-- Scoring, notation, and composition applications
-- =============================================================================
CREATE TABLE composition_tools (
    composition_tool_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id             UUID REFERENCES brands(brand_id),
    tool_name            TEXT NOT NULL,
    version              TEXT,
    tool_type_ids        UUID[],
    plugin_format_ids    UUID[],
    description          TEXT,
    workflow_notes       TEXT,
    tag_ids              UUID[],
    disk_paths           JSONB NOT NULL DEFAULT '[]',
    created_at           TIMESTAMP DEFAULT NOW(),
    updated_at           TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- MODELS
-- Physical/hardware gear: amps, microphones, synths, keyboards, etc.
-- =============================================================================
CREATE TABLE model_types (
    type_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name        TEXT NOT NULL UNIQUE,
    type_description TEXT
);

CREATE TABLE models (
    model_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name       TEXT NOT NULL,
    brand_id         UUID REFERENCES brands(brand_id),
    model_type_ids   UUID[],
    creator          TEXT,
    years_active     TEXT,
    links            TEXT,
    description      TEXT,
    recording_notes  TEXT,
    artist_reference TEXT,
    attributes       JSONB,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_models_attributes ON models USING GIN (attributes);
CREATE INDEX IF NOT EXISTS idx_models_name ON models (model_name);

CREATE VIEW models_view AS
    SELECT
        models.*,
        brands.brand_name || ' ' || models.model_name AS full_model_name
    FROM models
LEFT JOIN brands ON brands.brand_id = models.brand_id;


-- =============================================================================
-- EFFECTS
-- Software and hardware effects, optionally linked to a hardware model
-- =============================================================================
CREATE TABLE effect_types (
    type_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name        TEXT NOT NULL UNIQUE,
    type_description TEXT
);

CREATE TABLE effects (
    effect_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id          UUID REFERENCES brands(brand_id),
    model_ids         UUID[],
    effect_name       TEXT NOT NULL,
    version           TEXT,
    collection        TEXT,
    effect_type_ids   UUID[],
    tool_type_ids     UUID[],
    plugin_format_ids UUID[],
    description       TEXT,
    workflow_notes    TEXT,
    recording_notes   TEXT,
    artist_reference  TEXT,
    attributes        JSONB,
    tag_ids           UUID[],
    parent_ids        parent_ref[],
    disk_paths        JSONB NOT NULL DEFAULT '[]',
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_effects_attributes ON effects USING GIN (attributes);
CREATE INDEX IF NOT EXISTS idx_effects_name ON effects (effect_name);
CREATE INDEX IF NOT EXISTS idx_effects_disk_paths ON effects USING GIN (disk_paths);


-- =============================================================================
-- INSTRUMENTS
-- Software instruments: synths, samplers, keyboards, drums, etc.
-- =============================================================================
CREATE TABLE instrument_types (
    type_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name        TEXT NOT NULL UNIQUE,
    type_description TEXT
);

CREATE TABLE instruments (
    instrument_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id           UUID REFERENCES brands(brand_id),
    model_ids          UUID[],
    instrument_name    TEXT NOT NULL,
    version            TEXT,
    instrument_type_ids UUID[],
    tool_type_ids      UUID[],
    plugin_format_ids  UUID[],
    description        TEXT,
    instrument_notes   TEXT,
    recording_notes    TEXT,
    tag_ids            UUID[],
    attributes         JSONB,
    parent_ids         parent_ref[],
    disk_paths         JSONB NOT NULL DEFAULT '[]',
    created_at         TIMESTAMP DEFAULT NOW(),
    updated_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_instruments_attributes ON instruments USING GIN (attributes);
CREATE INDEX IF NOT EXISTS idx_instruments_name ON instruments (instrument_name);
CREATE INDEX IF NOT EXISTS idx_instruments_disk_paths ON instruments USING GIN (disk_paths);


-- =============================================================================
-- LIBRARIES
-- Sample libraries and content packs linked to a host instrument or platform
-- =============================================================================
CREATE TABLE libraries (
    library_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id          UUID REFERENCES brands(brand_id),
    model_ids         UUID[],
    library_name      TEXT NOT NULL,
    description       TEXT,
    instrument_notes  TEXT,
    recording_notes   TEXT,
    workflow_notes    TEXT,
    tag_ids           UUID[],
    attributes        JSONB,
    parent_ids        parent_ref[],
    disk_paths        JSONB NOT NULL DEFAULT '[]',
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_libraries_attributes ON libraries USING GIN (attributes);
CREATE INDEX IF NOT EXISTS idx_libraries_name ON libraries (library_name);
CREATE INDEX IF NOT EXISTS idx_libraries_disk_paths ON libraries USING GIN (disk_paths);


-- =============================================================================
-- ADMIN TOOLS
-- License managers, downloaders, product portals — never recommended
-- =============================================================================
CREATE TABLE admin_tools (
    admin_tool_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id          UUID REFERENCES brands(brand_id),
    tool_name         TEXT NOT NULL,
    version           TEXT,
    tool_type_ids     UUID[],
    plugin_format_ids UUID[],
    description       TEXT,
    workflow_notes    TEXT,
    tag_ids           UUID[],
    disk_paths        JSONB NOT NULL DEFAULT '[]',
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- USERS
-- Application user accounts for login
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    google_id     TEXT UNIQUE,
    email         TEXT UNIQUE,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW(),
    CONSTRAINT users_must_have_auth CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
);

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_must_have_auth'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_must_have_auth
      CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL);
  END IF;
END $$;

-- =============================================================================
-- SOFT-DELETE: deleted_at on all 18 content and config tables
-- =============================================================================
ALTER TABLE brands            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE models            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE effects           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE instruments       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE instruments       ADD COLUMN IF NOT EXISTS artist_reference TEXT;
ALTER TABLE libraries         ADD COLUMN IF NOT EXISTS workflow_notes TEXT;
ALTER TABLE libraries         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE workstations      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE admin_tools       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE composition_tools ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE measurement_tools ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE reference_tools   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE workflow_tools    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE effect_types      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE entity_types      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE instrument_types  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE model_types       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE plugin_formats    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE tag_types         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE tool_types        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- =============================================================================
-- AUDIT LOG
-- =============================================================================
-- NOTE: All timestamp columns in audit_log use TIMESTAMPTZ (timezone-aware).
-- Existing content table timestamps (created_at, updated_at) use TIMESTAMP (no timezone).
-- This is an intentional improvement — TIMESTAMPTZ is unambiguously correct for audit data.
-- When comparing audit timestamps to content timestamps, PostgreSQL performs an implicit cast
-- using the session timezone. A future migration to bring existing columns to TIMESTAMPTZ
-- is tracked but out of scope here.
CREATE TABLE IF NOT EXISTS audit_log (
    audit_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name      TEXT NOT NULL,
    record_id       UUID NOT NULL,    -- PK value of the audited row; no FK (row may be deleted)
    operation       TEXT NOT NULL CHECK (operation IN ('CREATE', 'UPDATE', 'DELETE')),
    old_data        JSONB,
    new_data        JSONB,
    performed_by    TEXT NOT NULL,
    performed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    undone_at       TIMESTAMPTZ,
    undone_by       TEXT,
    CONSTRAINT audit_log_state_exclusive CHECK (
        acknowledged_at IS NULL OR undone_at IS NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record
    ON audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_performed_at
    ON audit_log (performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_pending
    ON audit_log (performed_at DESC)
    WHERE acknowledged_at IS NULL AND undone_at IS NULL;

-- =============================================================================
-- TRIGRAM INDEXES (pg_trgm) — powers fuzzy-search column filters
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_brands_brand_name_trgm     ON brands       USING gin (brand_name      gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_brands_legal_name_trgm     ON brands       USING gin (legal_name       gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_effects_name_trgm          ON effects      USING gin (effect_name      gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_effects_version_trgm       ON effects      USING gin (version          gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_effects_collection_trgm    ON effects      USING gin (collection       gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_instruments_name_trgm      ON instruments  USING gin (instrument_name  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_instruments_version_trgm   ON instruments  USING gin (version          gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_libraries_name_trgm        ON libraries    USING gin (library_name     gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_models_name_trgm           ON models       USING gin (model_name       gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_workstations_name_trgm     ON workstations USING gin (tool_name        gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_workstations_version_trgm  ON workstations USING gin (version          gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_workflow_tools_name_trgm      ON workflow_tools      USING gin (tool_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_measurement_tools_name_trgm   ON measurement_tools   USING gin (tool_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_reference_tools_name_trgm     ON reference_tools     USING gin (tool_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_composition_tools_name_trgm   ON composition_tools   USING gin (tool_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_admin_tools_name_trgm         ON admin_tools         USING gin (tool_name gin_trgm_ops);
