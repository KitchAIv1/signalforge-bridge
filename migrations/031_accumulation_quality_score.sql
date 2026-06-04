ALTER TABLE amd_state
  ADD COLUMN IF NOT EXISTS accumulation_quality_score numeric;

COMMENT ON COLUMN amd_state.accumulation_quality_score IS
  'Asian accumulation quality: 1 - abs(net_pips / range_pips). 0-1. Higher = tighter coil. Null when insufficient candle data.';
