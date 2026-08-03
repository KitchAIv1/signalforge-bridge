-- ALPHAOMEGA place-only toxic-crack skip (shallow + refuse-tape).
-- Defaults OFF: flip alpha_omega_toxic_crack_skip_enabled via dashboard / SQL; no redeploy.
-- Does not change streak observe, SPEEDFLOOR, mid-band, or exits.

INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'alpha_omega_toxic_crack_skip_enabled',
  to_jsonb(false),
  'When true, Lane B ALPHAOMEGA blocks place on shallow cracks (len=7, speed<=40) during refuse pre-tape (3h high block/no-crack rate + weak conf). Place-only; streak observe untouched. Default off.',
  'alpha_omega'
)
ON CONFLICT (config_key) DO NOTHING;
