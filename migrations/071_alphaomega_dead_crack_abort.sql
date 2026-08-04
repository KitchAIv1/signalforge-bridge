-- ALPHAOMEGA dead-crack abort (no-follow-through exit) — additive exit,
-- runs LAST after opposing-count/opposing-share/hard-stop/backstop/giveback.
-- Defaults OFF: flip alpha_omega_dead_crack_abort_enabled via dashboard / SQL; no redeploy.
-- Shadow would_abort logging runs while OFF. Entries and streak observe untouched.

ALTER TABLE alpha_omega_position_state
  ADD COLUMN IF NOT EXISTS trough_adverse_pips NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN alpha_omega_position_state.trough_adverse_pips IS
  'Running worst-ever adverse excursion (pips) since entry, updated by alphaOmegaHardStopMonitor.ts each 30s cycle. Feeds the dead-crack abort (>=30m hold, MFE<1.5p, MAE>=3p).';

INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'alpha_omega_dead_crack_abort_enabled',
  to_jsonb(false),
  'When true, Lane B ALPHAOMEGA closes a position that is >=30m old, never reached 1.5p favorable, and has been >=3p underwater (close_reason=alphaomega_dead_crack_abort). Checked last after hard stop and giveback trail, same 30s cycle. Shadow would_abort logs while off. Default off.',
  'alpha_omega'
)
ON CONFLICT (config_key) DO NOTHING;
