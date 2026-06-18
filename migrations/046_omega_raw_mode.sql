-- Omega Raw Mode: bypass direction/threshold/window/inverse gates; news + circuit breaker always on.
-- When false (default): existing layer stack applies unchanged.
INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'omega_raw_mode',
  to_jsonb(false::boolean),
  'When true: Omega bypasses direction override, execution_threshold, inverse split, and window gate. News filter, circuit breaker, and opposing-position guard always active.',
  'signal'
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
    'omega_raw_mode'
  ))
  WITH CHECK (config_key IN (
    'bridge_active',
    'kill_switch',
    'paused_engines',
    'omega_direction',
    'rebuild_bounds_retry',
    'rebuild_hour_gate_enabled',
    'omega_raw_mode'
  ));
