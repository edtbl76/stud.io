-- =============================================================================
-- STUD.io Schema
-- Tables are added incrementally as each is properly designed
-- =============================================================================

-- =============================================================================
-- ENUMS
-- =============================================================================
CREATE TYPE entity_type AS ENUM ('Manufacturer', 'Studio', 'Individual');
CREATE TYPE tool_type AS ENUM ('Standalone', 'Plugin');
CREATE TYPE plugin_format AS ENUM ('AU', 'VST3', 'VST', 'UAD-2', 'UADx');
CREATE TYPE tag_type AS ENUM ('Deprecated', 'Hardware', 'Mastering', 'Restoration');

-- =============================================================================
-- BRANDS
-- Companies, recording studios, and individual builders associated with gear
-- =============================================================================
CREATE TABLE brands (
    brand_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    common_name  TEXT,
    entity_type  entity_type NOT NULL DEFAULT 'Manufacturer',
    website      TEXT,
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
    name            TEXT NOT NULL,
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
    name                 TEXT NOT NULL,
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
    name               TEXT NOT NULL,
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
    name              TEXT NOT NULL,
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
    name                 TEXT NOT NULL,
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
-- ADMIN TOOLS
-- License managers, downloaders, product portals — never recommended
-- =============================================================================
CREATE TABLE admin_tools (
    admin_tool_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id        UUID REFERENCES brands(brand_id),
    name            TEXT NOT NULL,
    version         TEXT,
    tool_types      tool_type[],
    plugin_formats  plugin_format[],
    description     TEXT,
    workflow_notes  TEXT,
    tags            tag_type[],
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
