-- Rebuild: optional second market attempt without priceBound when OANDA returns BOUNDS_VIOLATION.
-- Dashboard (anon) may update this key together with other engine control keys.

INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'rebuild_bounds_retry',
  to_jsonb(false::boolean),
  'When true, if engine_rebuild market order is cancelled with BOUNDS_VIOLATION, retry once without 2-pip priceBound',
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
    'rebuild_bounds_retry'
  ))
  WITH CHECK (config_key IN (
    'bridge_active',
    'kill_switch',
    'paused_engines',
    'omega_direction',
    'rebuild_bounds_retry'
  ));
