-- =============================================================================
-- STUD.io Schema
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
    legal_name       TEXT NOT NULL,
    brand_name       TEXT,
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
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_effects_attributes ON effects USING GIN (attributes);


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
    created_at         TIMESTAMP DEFAULT NOW(),
    updated_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_instruments_attributes ON instruments USING GIN (attributes);


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
    attributes        JSONB,
    parent_ids        parent_ref[],
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_libraries_attributes ON libraries USING GIN (attributes);


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
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP DEFAULT NOW()
);
