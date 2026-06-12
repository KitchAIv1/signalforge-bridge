-- Ensure asian_session_detection_log can store D1_FALLBACK rows
-- All columns already exist from migration 039.
-- This migration seeds the bridge_config key for direction_source
-- so setBridgeConfigValues can UPDATE it (UPDATE requires row to exist).

INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'direction_source',
  to_jsonb(''::text),
  'Source of omega_direction write',
  'omega'
)
ON CONFLICT (config_key) DO NOTHING;
