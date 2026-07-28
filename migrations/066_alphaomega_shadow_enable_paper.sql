-- Migration 066: Enable Shadow AO paper soak (bridge_config only).
-- Live AO unchanged. Engine still needs OMEGA_AO_SHADOW_OVER_EMIT=true on Railway.

UPDATE bridge_config
SET
  config_value = to_jsonb(true),
  description = 'Shadow AO paper soak ON — isolated streak/paper; never live broker orders',
  updated_at = NOW()
WHERE config_key = 'alpha_omega_shadow_enabled';
