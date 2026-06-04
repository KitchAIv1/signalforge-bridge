ALTER TABLE amd_state
  ADD COLUMN IF NOT EXISTS m5_w2_net_pips numeric,
  ADD COLUMN IF NOT EXISTS m5_momentum_type text;

COMMENT ON COLUMN amd_state.m5_w2_net_pips IS
  'M5 candles 3-5 net pip move (10:15-10:30 UTC). Sum of per-candle body pips × 10000.';

COMMENT ON COLUMN amd_state.m5_momentum_type IS
  'SUSTAINED = W1 and W2 same direction. REVERSED = opposite (fake bounce/continuation). STALLED = either window flat. Null when insufficient candles.';
