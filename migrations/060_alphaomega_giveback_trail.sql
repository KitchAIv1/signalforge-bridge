-- ALPHAOMEGA Lane B peak-favorable-giveback profit lock — additive exit,
-- runs alongside (never replaces) opposing-count/opposing-share/hard-stop/backstop.
-- Defaults OFF: flip alpha_omega_giveback_trail_enabled to true when ready; no redeploy needed.

ALTER TABLE alpha_omega_position_state
  ADD COLUMN IF NOT EXISTS peak_favorable_pips NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN alpha_omega_position_state.peak_favorable_pips IS
  'Running best-ever favorable excursion (pips) since entry, updated by alphaOmegaHardStopMonitor.ts each 30s cycle. Feeds the giveback-trail exit and the dashboard Open Risk card.';

INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'alpha_omega_giveback_trail_enabled',
  to_jsonb(false),
  'When true, Lane B ALPHAOMEGA locks in profit once peak favorable move >=6p then gives back 3p from peak (close_reason=alphaomega_peak_giveback_trail). Checked after hard stop, same 30s cycle. Opposing-count/share/backstop/hard-stop unchanged either way.',
  'alpha_omega'
)
ON CONFLICT (config_key) DO NOTHING;
