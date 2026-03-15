-- =============================================================================
-- STUD.io Schema
-- Tables are added incrementally as each is properly designed
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TYPE entity_type AS ENUM ('Manufacturer', 'Studio', 'Individual');
CREATE TYPE tool_type AS ENUM ('Standalone', 'Plugin', 'Embedded');
CREATE TYPE plugin_format AS ENUM ('AU', 'VST3', 'VST', 'UAD-2', 'UADx');
CREATE TYPE tag_type AS ENUM (
    'Deprecated', 'Hardware', 'Mastering', 'Restoration',
    'Bass', 'Channel Strip', 'Drums', 'Filter Out', 'Guitar', 'Live Sound', 'Low DSP',
    'Modeled', 'Remove', 'Stomp', 'Surround', 'Voice'
);

-- =============================================================================
-- BRANDS
-- Companies, recording studios, and individual builders associated with gear
-- =============================================================================
CREATE TABLE brands (
    brand_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name   TEXT NOT NULL,
    brand_name   TEXT,
    entity_type  entity_type NOT NULL DEFAULT 'Manufacturer',
    website      TEXT,
    description  TEXT,
    founder      TEXT,
    years        TEXT,
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- WORKSTATIONS
-- DAWs and mastering suites — the primary hosts for production
-- =============================================================================
CREATE TABLE workstations (
    workstation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id        UUID REFERENCES brands(brand_id),
    tool_name       TEXT NOT NULL,
    version         TEXT,
    tool_types      tool_type[],
    plugin_formats  plugin_format[],
    description     TEXT,
    workflow_notes  TEXT,
    tags            tag_type[],
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
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
    tool_types           tool_type[],
    plugin_formats       plugin_format[],
    description          TEXT,
    workflow_notes       TEXT,
    tags                 tag_type[],
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
    tool_types         tool_type[],
    plugin_formats     plugin_format[],
    description        TEXT,
    workflow_notes     TEXT,
    tags               tag_type[],
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
    tool_types        tool_type[],
    plugin_formats    plugin_format[],
    description       TEXT,
    workflow_notes    TEXT,
    tags              tag_type[],
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
    tool_types           tool_type[],
    plugin_formats       plugin_format[],
    description          TEXT,
    workflow_notes       TEXT,
    tags                 tag_type[],
    created_at           TIMESTAMP DEFAULT NOW(),
    updated_at           TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- MODELS
-- Physical/hardware gear: amps, microphones, synths, keyboards, etc.
-- =============================================================================
CREATE TYPE model_type AS ENUM (
    'Bass', 'Cabinet', 'Channel Strip', 'Combo', 'Console', 'Delay',
    'Drums', 'Dynamics', 'EQ', 'Harmonic Coloration', 'Head',
    'Keyboard', 'Microphone', 'Modulation', 'Multi Effects',
    'Pitch Tools', 'Preamp', 'DI', 'Reverb', 'Sampler',
    'Spatial Processing', 'Speaker','Stomp', 'Studio', 'Synth',
    'Tape Machine', 'Utility'
);

CREATE TABLE models (
    model_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name       TEXT NOT NULL,
    brand_id         UUID REFERENCES brands(brand_id),
    model_types      model_type[],
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
CREATE TYPE effect_type AS ENUM (
    'Cabinet', 'Combo', 'Container', 'Delay',
    'Dynamics', 'EQ', 'Harmonic Coloration', 'Head',
    'Microphone', 'Modulation', 'Pitch Tools', 'Preamp', 'DI', 'Reverb&Room',
    'Spatial Processing', 'Time/Phase'
);

CREATE TABLE effects (
    effect_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id         UUID REFERENCES brands(brand_id),
    model_ids        UUID[],
    effect_name      TEXT NOT NULL,
    version          TEXT,
    collection       TEXT,
    effect_types     effect_type[],
    tool_types       tool_type[],
    plugin_formats   plugin_format[],
    description      TEXT,
    plugin_notes     TEXT,
    workflow_notes   TEXT,
    recording_notes  TEXT,
    artist_reference TEXT,
    attributes       JSONB,
    tags             tag_type[],
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_effects_attributes ON effects USING GIN (attributes);


-- =============================================================================
-- INSTRUMENTS
-- Software instruments: synths, samplers, keyboards, drums, etc.
-- =============================================================================
CREATE TYPE instrument_type AS ENUM (
    'Bass', 'Brass', 'Container', 'Drums & Percussion', 'Guitars',
    'Keyboards', 'Pads & Textures', 'Pipes', 'Rhythm', 'Sampling',
    'Sound Design', 'Strings', 'Synth', 'Vocal', 'Woodwinds', 'World Instruments'
);

CREATE TABLE instruments (
    instrument_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id         UUID REFERENCES brands(brand_id),
    model_ids        UUID[],
    instrument_name  TEXT NOT NULL,
    version          TEXT,
    instrument_types instrument_type[],
    tool_types       tool_type[],
    plugin_formats   plugin_format[],
    plugin_notes     TEXT,
    instrument_notes TEXT,
    recording_notes  TEXT,
    tags             tag_type[],
    attributes       JSONB,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_instruments_attributes ON instruments USING GIN (attributes);


-- =============================================================================
-- LIBRARIES
-- Sample libraries and content packs linked to a host instrument or platform
-- =============================================================================
CREATE TABLE libraries (
    library_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id      UUID REFERENCES brands(brand_id),
    model_ids     UUID[],
    library_name  TEXT NOT NULL,
    notes         TEXT,
    attributes    JSONB,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_libraries_attributes ON libraries USING GIN (attributes);


-- =============================================================================
-- ADMIN TOOLS
-- License managers, downloaders, product portals — never recommended
-- =============================================================================
CREATE TABLE admin_tools (
    admin_tool_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id        UUID REFERENCES brands(brand_id),
    tool_name       TEXT NOT NULL,
    version         TEXT,
    tool_types      tool_type[],
    plugin_formats  plugin_format[],
    description     TEXT,
    workflow_notes  TEXT,
    tags            tag_type[],
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
