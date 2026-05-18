-- AMD auto-direction layer — v2.4.0
-- Adds auto_direction columns to amd_state,
-- direction_source + amd_size_multiplier to bridge_trade_log,
-- and direction_mode config key to bridge_config.
-- Safe to re-run: IF NOT EXISTS / ON CONFLICT DO NOTHING.

-- amd_state: auto direction output columns
ALTER TABLE amd_state
  ADD COLUMN IF NOT EXISTS auto_direction text,
  ADD COLUMN IF NOT EXISTS auto_direction_confidence text,
  ADD COLUMN IF NOT EXISTS auto_direction_reason text,
  ADD COLUMN IF NOT EXISTS amd_size_multiplier numeric;

-- bridge_trade_log: execution audit columns
ALTER TABLE bridge_trade_log
  ADD COLUMN IF NOT EXISTS direction_source text,
  ADD COLUMN IF NOT EXISTS amd_size_multiplier numeric;

-- bridge_config: direction mode
-- 'manual' default preserves all existing behaviour until explicitly switched to 'auto'
INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'direction_mode',
  to_jsonb('manual'::text),
  'Omega direction mode: manual = human sets direction via dashboard, auto = AMD intelligence sets direction at 10:05 UTC daily',
  'system'
)
ON CONFLICT (config_key) DO NOTHING;
