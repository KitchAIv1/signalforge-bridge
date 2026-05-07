-- Rebuild: dashboard + bridge toggle for UTC hour gate (live execution only; shadow unaffected).
INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'rebuild_hour_gate_enabled',
  to_jsonb(true::boolean),
  'When true, bridge blocks engine_rebuild in configured bad UTC hours. When false, hour gate skipped (medium-R gate unchanged).',
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
    'rebuild_hour_gate_enabled'
  ))
  WITH CHECK (config_key IN (
    'bridge_active',
    'kill_switch',
    'paused_engines',
    'omega_direction',
    'rebuild_bounds_retry',
    'rebuild_hour_gate_enabled'
  ));
