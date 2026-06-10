-- Asian session three-layer confidence stack
-- Safe to re-run: IF NOT EXISTS / ON CONFLICT DO NOTHING

ALTER TABLE asian_session_detection_log
  ADD COLUMN IF NOT EXISTS confidence_tier text,
  ADD COLUMN IF NOT EXISTS prior_direction_bias text;

INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES
  (
    'asian_prior_direction_bias',
    to_jsonb(''::text),
    'Prior-day AMD directional bias for Asian session (set at 21:10 UTC)',
    'system'
  ),
  (
    'asian_detection_confidence',
    to_jsonb(''::text),
    'Advisory confidence tier from last Asian pattern detection (HIGH/MEDIUM/LOW)',
    'system'
  )
ON CONFLICT (config_key) DO NOTHING;
