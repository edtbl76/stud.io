-- =============================================================================
-- Seed: gear_types
-- =============================================================================

INSERT INTO gear_types (type_id, type_name) VALUES ('a1b2c3d4-0001-0000-0000-000000000001', 'Guitar')          ON CONFLICT (type_id) DO UPDATE SET type_name = EXCLUDED.type_name, deleted_at = NULL;
INSERT INTO gear_types (type_id, type_name) VALUES ('a1b2c3d4-0002-0000-0000-000000000002', 'Amp')             ON CONFLICT (type_id) DO UPDATE SET type_name = EXCLUDED.type_name, deleted_at = NULL;
INSERT INTO gear_types (type_id, type_name) VALUES ('a1b2c3d4-0003-0000-0000-000000000003', 'Pedal')           ON CONFLICT (type_id) DO UPDATE SET type_name = EXCLUDED.type_name, deleted_at = NULL;
INSERT INTO gear_types (type_id, type_name) VALUES ('a1b2c3d4-0004-0000-0000-000000000004', 'Tuner')           ON CONFLICT (type_id) DO UPDATE SET type_name = EXCLUDED.type_name, deleted_at = NULL;
INSERT INTO gear_types (type_id, type_name) VALUES ('a1b2c3d4-0005-0000-0000-000000000005', 'Metronome')       ON CONFLICT (type_id) DO UPDATE SET type_name = EXCLUDED.type_name, deleted_at = NULL;
INSERT INTO gear_types (type_id, type_name) VALUES ('a1b2c3d4-0006-0000-0000-000000000006', 'MIDI Controller') ON CONFLICT (type_id) DO UPDATE SET type_name = EXCLUDED.type_name, deleted_at = NULL;
INSERT INTO gear_types (type_id, type_name) VALUES ('a1b2c3d4-0007-0000-0000-000000000007', 'Speaker')         ON CONFLICT (type_id) DO UPDATE SET type_name = EXCLUDED.type_name, deleted_at = NULL;
INSERT INTO gear_types (type_id, type_name) VALUES ('a1b2c3d4-0008-0000-0000-000000000008', 'Microphone')      ON CONFLICT (type_id) DO UPDATE SET type_name = EXCLUDED.type_name, deleted_at = NULL;
