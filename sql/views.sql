-- =============================================================================
-- STUD.io Semantic Views
-- One view per major table resolving UUIDs to display names.
-- Reads: routers SELECT from these views.
-- Writes: routers INSERT/UPDATE/DELETE against base tables directly.
--
-- NOTE: Regular views (not materialized) so writes are visible immediately
-- within the same transaction — required for test isolation.
-- =============================================================================

-- Reusable parent resolution subquery pattern (used in effects/instruments/libraries):
--   FROM unnest(COALESCE(t.parent_ids, ARRAY[]::parent_ref[])) p
--   resolved via CASE on (p).table_name

-- ---------------------------------------------------------------------------
-- BRANDS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW brands_view AS
SELECT
    b.brand_id,
    b.legal_name,
    b.brand_name,
    b.entity_type_id,
    et.type_name        AS entity_type_name,
    b.website,
    b.description,
    b.founder,
    b.years,
    b.created_at,
    b.updated_at
FROM brands b
LEFT JOIN entity_types et ON et.type_id = b.entity_type_id
WHERE b.deleted_at IS NULL;


-- ---------------------------------------------------------------------------
-- MODELS  (replaces the minimal view already in schema.sql)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS models_view CASCADE;

CREATE OR REPLACE VIEW models_view AS
SELECT
    m.model_id,
    m.model_name,
    m.brand_id,
    b.brand_name,
    TRIM(COALESCE(b.brand_name, '') || ' ' || m.model_name) AS full_model_name,
    m.model_type_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(m.model_type_ids, ARRAY[]::UUID[])) uid
     JOIN   model_types t ON t.type_id = uid)               AS model_types,
    m.creator,
    m.years_active,
    m.links,
    m.description,
    m.recording_notes,
    m.artist_reference,
    m.attributes,
    m.created_at,
    m.updated_at
FROM  models m
LEFT JOIN brands b ON b.brand_id = m.brand_id
WHERE m.deleted_at IS NULL;


-- ---------------------------------------------------------------------------
-- EFFECTS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW effects_view AS
SELECT
    e.effect_id,
    e.effect_name,
    e.brand_id,
    b.brand_name,
    TRIM(COALESCE(b.brand_name, '') || ' ' || e.effect_name) AS full_effect_name,
    e.version,
    e.collection,

    -- model_ids → [{id, name}]
    e.model_ids,
    model_agg.models,

    -- effect_type_ids → [{id, name}]
    e.effect_type_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(e.effect_type_ids, ARRAY[]::UUID[])) uid
     JOIN   effect_types t ON t.type_id = uid)               AS effect_types,

    -- tool_type_ids → [{id, name}]
    e.tool_type_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(e.tool_type_ids, ARRAY[]::UUID[])) uid
     JOIN   tool_types t ON t.type_id = uid)                 AS tool_types,

    -- plugin_format_ids → [{id, name}]
    e.plugin_format_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(e.plugin_format_ids, ARRAY[]::UUID[])) uid
     JOIN   plugin_formats t ON t.type_id = uid)             AS plugin_formats,

    -- tag_ids → [{id, name}]
    e.tag_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(e.tag_ids, ARRAY[]::UUID[])) uid
     JOIN   tag_types t ON t.type_id = uid)                  AS tags,

    -- parent_ids → [{table_name, id, name}]
    e.parent_ids,
    (SELECT COALESCE(json_agg(
                json_build_object(
                    'table_name', (p).table_name,
                    'id',         (p).id,
                    'name',       CASE (p).table_name
                        WHEN 'effects'      THEN (SELECT effect_name     FROM effects      WHERE effect_id      = (p).id)
                        WHEN 'instruments'  THEN (SELECT instrument_name FROM instruments  WHERE instrument_id  = (p).id)
                        WHEN 'libraries'    THEN (SELECT library_name    FROM libraries    WHERE library_id     = (p).id)
                        WHEN 'workstations' THEN (SELECT tool_name       FROM workstations WHERE workstation_id = (p).id)
                        ELSE NULL
                    END
                )
             ), '[]'::json)
     FROM   unnest(COALESCE(e.parent_ids, ARRAY[]::parent_ref[])) p) AS parents,

    e.description,
    e.workflow_notes,
    e.recording_notes,
    e.artist_reference,
    e.attributes,
    e.created_at,
    e.updated_at,
    e.disk_paths
FROM  effects e
LEFT JOIN brands b ON b.brand_id = e.brand_id
LEFT JOIN LATERAL (
    SELECT COALESCE(json_agg(
                json_build_object('id', m.model_id, 'name', TRIM(COALESCE(mb.brand_name, '') || ' ' || m.model_name))
                ORDER BY m.model_name
             ), '[]'::json) AS models
    FROM   unnest(COALESCE(e.model_ids, ARRAY[]::UUID[])) uid
    JOIN   models m ON m.model_id = uid
    LEFT JOIN brands mb ON mb.brand_id = m.brand_id
) model_agg ON true
WHERE e.deleted_at IS NULL;


-- ---------------------------------------------------------------------------
-- INSTRUMENTS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW instruments_view AS
SELECT
    i.instrument_id,
    i.instrument_name,
    i.brand_id,
    b.brand_name,
    TRIM(COALESCE(b.brand_name, '') || ' ' || i.instrument_name) AS full_instrument_name,
    i.version,

    -- model_ids → [{id, name}]
    i.model_ids,
    model_agg.models,

    -- instrument_type_ids → [{id, name}]
    i.instrument_type_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(i.instrument_type_ids, ARRAY[]::UUID[])) uid
     JOIN   instrument_types t ON t.type_id = uid)               AS instrument_types,

    -- tool_type_ids → [{id, name}]
    i.tool_type_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(i.tool_type_ids, ARRAY[]::UUID[])) uid
     JOIN   tool_types t ON t.type_id = uid)                     AS tool_types,

    -- plugin_format_ids → [{id, name}]
    i.plugin_format_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(i.plugin_format_ids, ARRAY[]::UUID[])) uid
     JOIN   plugin_formats t ON t.type_id = uid)                 AS plugin_formats,

    -- tag_ids → [{id, name}]
    i.tag_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(i.tag_ids, ARRAY[]::UUID[])) uid
     JOIN   tag_types t ON t.type_id = uid)                      AS tags,

    -- parent_ids → [{table_name, id, name}]
    i.parent_ids,
    (SELECT COALESCE(json_agg(
                json_build_object(
                    'table_name', (p).table_name,
                    'id',         (p).id,
                    'name',       CASE (p).table_name
                        WHEN 'effects'      THEN (SELECT effect_name     FROM effects      WHERE effect_id      = (p).id)
                        WHEN 'instruments'  THEN (SELECT instrument_name FROM instruments  WHERE instrument_id  = (p).id)
                        WHEN 'libraries'    THEN (SELECT library_name    FROM libraries    WHERE library_id     = (p).id)
                        WHEN 'workstations' THEN (SELECT tool_name       FROM workstations WHERE workstation_id = (p).id)
                        ELSE NULL
                    END
                )
             ), '[]'::json)
     FROM   unnest(COALESCE(i.parent_ids, ARRAY[]::parent_ref[])) p) AS parents,

    i.description,
    i.instrument_notes,
    i.recording_notes,
    i.artist_reference,
    i.attributes,
    i.created_at,
    i.updated_at,
    i.disk_paths
FROM  instruments i
LEFT JOIN brands b ON b.brand_id = i.brand_id
LEFT JOIN LATERAL (
    SELECT COALESCE(json_agg(
                json_build_object('id', m.model_id, 'name', TRIM(COALESCE(mb.brand_name, '') || ' ' || m.model_name))
                ORDER BY m.model_name
             ), '[]'::json) AS models
    FROM   unnest(COALESCE(i.model_ids, ARRAY[]::UUID[])) uid
    JOIN   models m ON m.model_id = uid
    LEFT JOIN brands mb ON mb.brand_id = m.brand_id
) model_agg ON true
WHERE i.deleted_at IS NULL;


-- ---------------------------------------------------------------------------
-- LIBRARIES
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS libraries_view;
CREATE OR REPLACE VIEW libraries_view AS
SELECT
    l.library_id,
    l.library_name,
    l.brand_id,
    b.brand_name,
    TRIM(COALESCE(b.brand_name, '') || ' ' || l.library_name) AS full_library_name,

    -- model_ids → [{id, name}]
    l.model_ids,
    model_agg.models,

    -- tag_ids → [{id, name}]
    l.tag_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(l.tag_ids, ARRAY[]::UUID[])) uid
     JOIN   tag_types t ON t.type_id = uid)                  AS tags,

    -- parent_ids → [{table_name, id, name}]
    l.parent_ids,
    (SELECT COALESCE(json_agg(
                json_build_object(
                    'table_name', (p).table_name,
                    'id',         (p).id,
                    'name',       CASE (p).table_name
                        WHEN 'effects'      THEN (SELECT effect_name     FROM effects      WHERE effect_id      = (p).id)
                        WHEN 'instruments'  THEN (SELECT instrument_name FROM instruments  WHERE instrument_id  = (p).id)
                        WHEN 'libraries'    THEN (SELECT library_name    FROM libraries    WHERE library_id     = (p).id)
                        WHEN 'workstations' THEN (SELECT tool_name       FROM workstations WHERE workstation_id = (p).id)
                        ELSE NULL
                    END
                )
             ), '[]'::json)
     FROM   unnest(COALESCE(l.parent_ids, ARRAY[]::parent_ref[])) p) AS parents,

    l.description,
    l.instrument_notes,
    l.recording_notes,
    l.workflow_notes,
    l.attributes,
    l.created_at,
    l.updated_at,
    l.disk_paths
FROM  libraries l
LEFT JOIN brands b ON b.brand_id = l.brand_id
LEFT JOIN LATERAL (
    SELECT COALESCE(json_agg(
                json_build_object('id', m.model_id, 'name', TRIM(COALESCE(mb.brand_name, '') || ' ' || m.model_name))
                ORDER BY m.model_name
             ), '[]'::json) AS models
    FROM   unnest(COALESCE(l.model_ids, ARRAY[]::UUID[])) uid
    JOIN   models m ON m.model_id = uid
    LEFT JOIN brands mb ON mb.brand_id = m.brand_id
) model_agg ON true
WHERE l.deleted_at IS NULL;


-- ---------------------------------------------------------------------------
-- WORKSTATIONS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW workstations_view AS
SELECT
    w.workstation_id,
    w.tool_name,
    w.brand_id,
    b.brand_name,
    TRIM(COALESCE(b.brand_name, '') || ' ' || w.tool_name) AS full_tool_name,
    w.version,

    w.tool_type_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(w.tool_type_ids, ARRAY[]::UUID[])) uid
     JOIN   tool_types t ON t.type_id = uid)                AS tool_types,

    w.plugin_format_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(w.plugin_format_ids, ARRAY[]::UUID[])) uid
     JOIN   plugin_formats t ON t.type_id = uid)            AS plugin_formats,

    w.tag_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(w.tag_ids, ARRAY[]::UUID[])) uid
     JOIN   tag_types t ON t.type_id = uid)                 AS tags,

    w.description,
    w.workflow_notes,
    w.created_at,
    w.updated_at,
    w.disk_paths
FROM  workstations w
LEFT JOIN brands b ON b.brand_id = w.brand_id
WHERE w.deleted_at IS NULL;


-- ---------------------------------------------------------------------------
-- WORKFLOW TOOLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW workflow_tools_view AS
SELECT
    wt.workflow_tool_id,
    wt.tool_name,
    wt.brand_id,
    b.brand_name,
    TRIM(COALESCE(b.brand_name, '') || ' ' || wt.tool_name) AS full_tool_name,
    wt.version,

    wt.tool_type_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(wt.tool_type_ids, ARRAY[]::UUID[])) uid
     JOIN   tool_types t ON t.type_id = uid)                 AS tool_types,

    wt.plugin_format_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(wt.plugin_format_ids, ARRAY[]::UUID[])) uid
     JOIN   plugin_formats t ON t.type_id = uid)             AS plugin_formats,

    wt.tag_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(wt.tag_ids, ARRAY[]::UUID[])) uid
     JOIN   tag_types t ON t.type_id = uid)                  AS tags,

    wt.description,
    wt.workflow_notes,
    wt.created_at,
    wt.updated_at,
    wt.disk_paths
FROM  workflow_tools wt
LEFT JOIN brands b ON b.brand_id = wt.brand_id
WHERE wt.deleted_at IS NULL;


-- ---------------------------------------------------------------------------
-- MEASUREMENT TOOLS  (has model_ids)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW measurement_tools_view AS
SELECT
    mt.measurement_tool_id,
    mt.tool_name,
    mt.brand_id,
    b.brand_name,
    TRIM(COALESCE(b.brand_name, '') || ' ' || mt.tool_name) AS full_tool_name,
    mt.version,

    mt.model_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', m.model_id, 'name', TRIM(COALESCE(mb.brand_name, '') || ' ' || m.model_name))
                ORDER BY m.model_name
             ), '[]'::json)
     FROM   unnest(COALESCE(mt.model_ids, ARRAY[]::UUID[])) uid
     JOIN   models m ON m.model_id = uid
     LEFT JOIN brands mb ON mb.brand_id = m.brand_id)        AS models,

    mt.tool_type_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(mt.tool_type_ids, ARRAY[]::UUID[])) uid
     JOIN   tool_types t ON t.type_id = uid)                 AS tool_types,

    mt.plugin_format_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(mt.plugin_format_ids, ARRAY[]::UUID[])) uid
     JOIN   plugin_formats t ON t.type_id = uid)             AS plugin_formats,

    mt.tag_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(mt.tag_ids, ARRAY[]::UUID[])) uid
     JOIN   tag_types t ON t.type_id = uid)                  AS tags,

    mt.description,
    mt.workflow_notes,
    mt.created_at,
    mt.updated_at,
    mt.disk_paths
FROM  measurement_tools mt
LEFT JOIN brands b ON b.brand_id = mt.brand_id
WHERE mt.deleted_at IS NULL;


-- ---------------------------------------------------------------------------
-- REFERENCE TOOLS  (has model_ids)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW reference_tools_view AS
SELECT
    rt.reference_tool_id,
    rt.tool_name,
    rt.brand_id,
    b.brand_name,
    TRIM(COALESCE(b.brand_name, '') || ' ' || rt.tool_name) AS full_tool_name,
    rt.version,

    rt.model_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', m.model_id, 'name', TRIM(COALESCE(mb.brand_name, '') || ' ' || m.model_name))
                ORDER BY m.model_name
             ), '[]'::json)
     FROM   unnest(COALESCE(rt.model_ids, ARRAY[]::UUID[])) uid
     JOIN   models m ON m.model_id = uid
     LEFT JOIN brands mb ON mb.brand_id = m.brand_id)        AS models,

    rt.tool_type_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(rt.tool_type_ids, ARRAY[]::UUID[])) uid
     JOIN   tool_types t ON t.type_id = uid)                 AS tool_types,

    rt.plugin_format_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(rt.plugin_format_ids, ARRAY[]::UUID[])) uid
     JOIN   plugin_formats t ON t.type_id = uid)             AS plugin_formats,

    rt.tag_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(rt.tag_ids, ARRAY[]::UUID[])) uid
     JOIN   tag_types t ON t.type_id = uid)                  AS tags,

    rt.description,
    rt.workflow_notes,
    rt.created_at,
    rt.updated_at,
    rt.disk_paths
FROM  reference_tools rt
LEFT JOIN brands b ON b.brand_id = rt.brand_id
WHERE rt.deleted_at IS NULL;


-- ---------------------------------------------------------------------------
-- COMPOSITION TOOLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW composition_tools_view AS
SELECT
    ct.composition_tool_id,
    ct.tool_name,
    ct.brand_id,
    b.brand_name,
    TRIM(COALESCE(b.brand_name, '') || ' ' || ct.tool_name) AS full_tool_name,
    ct.version,

    ct.tool_type_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(ct.tool_type_ids, ARRAY[]::UUID[])) uid
     JOIN   tool_types t ON t.type_id = uid)                 AS tool_types,

    ct.plugin_format_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(ct.plugin_format_ids, ARRAY[]::UUID[])) uid
     JOIN   plugin_formats t ON t.type_id = uid)             AS plugin_formats,

    ct.tag_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(ct.tag_ids, ARRAY[]::UUID[])) uid
     JOIN   tag_types t ON t.type_id = uid)                  AS tags,

    ct.description,
    ct.workflow_notes,
    ct.created_at,
    ct.updated_at,
    ct.disk_paths
FROM  composition_tools ct
LEFT JOIN brands b ON b.brand_id = ct.brand_id
WHERE ct.deleted_at IS NULL;


-- ---------------------------------------------------------------------------
-- ADMIN TOOLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW admin_tools_view AS
SELECT
    at.admin_tool_id,
    at.tool_name,
    at.brand_id,
    b.brand_name,
    TRIM(COALESCE(b.brand_name, '') || ' ' || at.tool_name) AS full_tool_name,
    at.version,

    at.tool_type_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(at.tool_type_ids, ARRAY[]::UUID[])) uid
     JOIN   tool_types t ON t.type_id = uid)                 AS tool_types,

    at.plugin_format_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(at.plugin_format_ids, ARRAY[]::UUID[])) uid
     JOIN   plugin_formats t ON t.type_id = uid)             AS plugin_formats,

    at.tag_ids,
    (SELECT COALESCE(json_agg(
                json_build_object('id', t.type_id, 'name', t.type_name)
                ORDER BY t.type_name
             ), '[]'::json)
     FROM   unnest(COALESCE(at.tag_ids, ARRAY[]::UUID[])) uid
     JOIN   tag_types t ON t.type_id = uid)                  AS tags,

    at.description,
    at.workflow_notes,
    at.created_at,
    at.updated_at,
    at.disk_paths
FROM  admin_tools at
LEFT JOIN brands b ON b.brand_id = at.brand_id
WHERE at.deleted_at IS NULL;

-- =============================================================================
-- GEARLIST
-- =============================================================================
DROP VIEW IF EXISTS gear_view;
CREATE VIEW gear_view AS
SELECT
    g.gear_id,
    g.gear_name,
    g.gear_type_id,
    gt.type_name                                                     AS gear_type_name,
    g.brand_id,
    b.brand_name,
    g.model_id,
    TRIM(COALESCE(mb.brand_name, '') || ' ' || m.model_name)         AS model_name,
    g.serial_number,
    g.year,
    g.owner_id,
    g.photo_key,
    g.notes,
    g.num_strings,
    g.tuning,
    g.pickup_config,
    g.pickup_neck_model_id,
    mn.model_name                                                    AS pickup_neck_model_name,
    g.pickup_middle_model_id,
    mm.model_name                                                    AS pickup_middle_model_name,
    g.pickup_bridge_model_id,
    mbr.model_name                                                   AS pickup_bridge_model_name,
    g.strings_model_id,
    TRIM(COALESCE(mbs.brand_name, '') || ' ' || ms.model_name)           AS strings_model_name,
    g.created_at,
    g.updated_at
FROM  gear g
LEFT JOIN gear_types gt  ON gt.type_id   = g.gear_type_id           AND gt.deleted_at IS NULL
LEFT JOIN brands b       ON b.brand_id   = g.brand_id
LEFT JOIN models m       ON m.model_id   = g.model_id
LEFT JOIN brands mb      ON mb.brand_id  = m.brand_id
LEFT JOIN models mn      ON mn.model_id  = g.pickup_neck_model_id
LEFT JOIN models mm      ON mm.model_id  = g.pickup_middle_model_id
LEFT JOIN models mbr     ON mbr.model_id = g.pickup_bridge_model_id
LEFT JOIN models ms      ON ms.model_id  = g.strings_model_id
LEFT JOIN brands mbs     ON mbs.brand_id = ms.brand_id
WHERE g.deleted_at IS NULL;

