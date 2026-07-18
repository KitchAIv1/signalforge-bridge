-- Migration 062: ALPHAOMEGA live ops posture (2026-07-18)
-- Locks production intent after research cutover:
--   - omega.weight 0.15 → 0.25 (SHARED engine row: Lane A RAW + Lane B AO both read this)
--   - alpha_omega_pure_sizing → true (Lane B only; no confluence/graduated/AMD/news overlays)
--   - alpha_omega_giveback_trail_enabled → true (Lane B exits; code already shipped in 060)
-- Idempotent UPDATEs — safe if already applied manually in Supabase.

UPDATE bridge_engines
SET weight = 0.25,
    updated_at = NOW()
WHERE engine_id = 'omega';

UPDATE bridge_config
SET config_value = to_jsonb(true),
    updated_at = NOW()
WHERE config_key = 'alpha_omega_pure_sizing';

UPDATE bridge_config
SET config_value = to_jsonb(true),
    updated_at = NOW()
WHERE config_key = 'alpha_omega_giveback_trail_enabled';

COMMENT ON TABLE alpha_omega_position_state IS
  'ALPHAOMEGA open-position tracking (opposing counts + peak_favorable_pips). '
  'Live posture as of migration 062: pure sizing on, giveback trail on, omega.weight=0.25.';
