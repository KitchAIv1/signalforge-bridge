-- ENGINE_AMD: dedicated OANDA sub-account (-004), weight 1.0, Asian close filter switch (default off).
-- Safe to re-run: ON CONFLICT / IF NOT EXISTS patterns.

INSERT INTO bridge_brokers (
  broker_id,
  broker_type,
  display_name,
  api_token_encrypted,
  account_id,
  environment,
  api_base_url,
  is_active
)
VALUES (
  'oanda_amd_demo',
  'oanda',
  'AMD Distribution',
  'ENV:OANDA_API_TOKEN',
  '101-001-38709456-004',
  'practice',
  'https://api-fxpractice.oanda.com',
  true
)
ON CONFLICT (broker_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  account_id = EXCLUDED.account_id,
  is_active = true,
  updated_at = NOW();

INSERT INTO bridge_engines (
  engine_id,
  engine_key,
  display_name,
  weight,
  is_active,
  max_daily_trades,
  execution_threshold,
  max_hold_hours
)
VALUES (
  'engine_amd',
  'engine_amd',
  'AMD Distribution',
  1.0,
  true,
  1,
  0,
  16
)
ON CONFLICT (engine_id) DO UPDATE SET
  weight = 1.0,
  max_daily_trades = 1,
  updated_at = NOW();

INSERT INTO bridge_links (engine_id, broker_id, is_active, capital_allocation_pct)
VALUES ('engine_amd', 'oanda_amd_demo', true, 1.0)
ON CONFLICT (engine_id, broker_id) DO UPDATE SET
  is_active = true,
  capital_allocation_pct = 1.0,
  updated_at = NOW();

INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'amd_asian_close_filter_enabled',
  to_jsonb(false::boolean),
  'When true: block AMD distribution when asian_close_bias_signal opposes auto_direction (ASIAN_CLOSE_DISAGREE). Default false = filter off.',
  'engine_amd'
)
ON CONFLICT (config_key) DO NOTHING;

DROP POLICY IF EXISTS "dashboard_update_bridge_config_switches" ON bridge_config;

CREATE POLICY "dashboard_update_bridge_config_switches"
  ON bridge_config FOR UPDATE TO anon
  USING (config_key IN (
    'bridge_active',
    'kill_switch',
    'paused_engines',
    'omega_direction',
    'rebuild_bounds_retry',
    'rebuild_hour_gate_enabled',
    'omega_raw_mode',
    'amd_asian_close_filter_enabled'
  ))
  WITH CHECK (config_key IN (
    'bridge_active',
    'kill_switch',
    'paused_engines',
    'omega_direction',
    'rebuild_bounds_retry',
    'rebuild_hour_gate_enabled',
    'omega_raw_mode',
    'amd_asian_close_filter_enabled'
  ));
