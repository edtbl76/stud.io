-- E2E seed: one guitar so the Guitars page has a row to click.
INSERT INTO gear (gear_id, gear_name, gear_type_id, pickup_config, num_strings)
VALUES (
    'cccccccc-0001-0000-0000-000000000001',
    'Test Stratocaster',
    'a1b2c3d4-0001-0000-0000-000000000001',
    'SSS',
    6
)
ON CONFLICT (gear_id) DO UPDATE
    SET gear_name    = EXCLUDED.gear_name,
        deleted_at   = NULL;
