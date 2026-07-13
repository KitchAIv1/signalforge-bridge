-- RAW Omega: pure sizing + fixed 1.5p peak giveback trail (validated Jul 2026).
-- Defaults ON so RAW Omega runs the researched policy; set false / 0 to revert.
-- Other engines unchanged. Open trail_stop_state rows keep their existing trail_distance.

INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'omega_raw_pure_sizing',
  to_jsonb(true),
  'When true, Omega sizes at equity×weight×riskPct only (no AMD/news/confluence/graduated). Other engines unchanged.',
  'omega'
)
ON CONFLICT (config_key) DO UPDATE
SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  updated_at = now();

INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'omega_trail_peak_giveback_pips',
  to_jsonb(1.5),
  'Omega trail lock distance in pips from peak (absolute). When >0 replaces 0.5R trail_distance for new Omega trail_stop_state rows. Set 0 to restore legacy R-multiple trail.',
  'omega'
)
ON CONFLICT (config_key) DO UPDATE
SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  updated_at = now();
