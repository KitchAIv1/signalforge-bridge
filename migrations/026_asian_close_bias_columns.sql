-- Migration 026: Asian close bias columns for direction filter.
-- Computed at 10:31 UTC by AmdDetectorService in same upsert as auto_direction.
-- Filter gate reads these at execution time in AmdDistributionEngine.

ALTER TABLE amd_state
  ADD COLUMN IF NOT EXISTS asian_close_position_pct NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS asian_close_bias_signal TEXT NULL;

COMMENT ON COLUMN amd_state.asian_close_position_pct IS
  'Asian session close position within range, 0-100. Computed at 10:31 UTC.';

COMMENT ON COLUMN amd_state.asian_close_bias_signal IS
  'Asian close bias: BULLISH (>=60), BEARISH (<=40), NEUTRAL (40-60), or NULL.';

CREATE INDEX IF NOT EXISTS idx_amd_state_asian_close_bias
  ON amd_state(asian_close_bias_signal)
  WHERE asian_close_bias_signal IS NOT NULL;
