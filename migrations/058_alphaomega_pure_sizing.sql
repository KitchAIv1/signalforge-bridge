-- ALPHAOMEGA pure sizing: Lane B AO entries ignore Omega AMD/news/confluence/graduated overlays.
-- Default false = legacy inherited sizing (safe rollout).
INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'alpha_omega_pure_sizing',
  to_jsonb(false),
  'When true, Lane B ALPHAOMEGA entries size at equity×weight×riskPct only (no AMD/news/confluence/graduated). Lane A/VT unchanged.',
  'alpha_omega'
)
ON CONFLICT (config_key) DO NOTHING;
