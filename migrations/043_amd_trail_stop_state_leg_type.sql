ALTER TABLE amd_trail_stop_state
ADD COLUMN leg_type TEXT;

COMMENT ON COLUMN amd_trail_stop_state.leg_type IS
  'For AMD_FAILED ratchet split-exit: tp1, tp2, trail. NULL for single-leg trades (all other tags).';
