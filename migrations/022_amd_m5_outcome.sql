-- Migration 022: AMD M5 signal capture + outcome tag
-- M5 columns written by AmdDetectorService at 10:31 UTC
-- Outcome columns written by outcome cron at 16:30 UTC

ALTER TABLE amd_state
  ADD COLUMN IF NOT EXISTS m5_first_3_net_pips numeric,
  ADD COLUMN IF NOT EXISTS m5_vs_judas_direction text,
  ADD COLUMN IF NOT EXISTS m5_first_candle_direction text,
  ADD COLUMN IF NOT EXISTS m5_evaluated_at timestamptz,
  ADD COLUMN IF NOT EXISTS amd_outcome_tag text,
  ADD COLUMN IF NOT EXISTS reversal_confirmed_outcome boolean,
  ADD COLUMN IF NOT EXISTS compression_breakout_outcome boolean,
  ADD COLUMN IF NOT EXISTS outcome_evaluated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_amd_state_m5_signal
  ON amd_state(pair, m5_vs_judas_direction, trade_date);

CREATE INDEX IF NOT EXISTS idx_amd_state_outcome_tag
  ON amd_state(pair, amd_outcome_tag, trade_date);
