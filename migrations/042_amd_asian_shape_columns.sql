-- Migration 042: Asian shape classification columns (research/advisory only).
-- Placed after asian_close_bias_signal, before decision_auto_direction.

ALTER TABLE amd_state
  ADD COLUMN IF NOT EXISTS asian_turn_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asian_turn_position NUMERIC,
  ADD COLUMN IF NOT EXISTS asian_pre_turn_speed NUMERIC,
  ADD COLUMN IF NOT EXISTS asian_post_turn_speed NUMERIC,
  ADD COLUMN IF NOT EXISTS asian_retracement_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS asian_shape TEXT,
  ADD COLUMN IF NOT EXISTS asian_shape_unclassified_reason TEXT;

COMMENT ON COLUMN amd_state.asian_shape IS
  'Research/advisory only — NOT used in amd_tag, auto_direction, or any execution decision. Classifies the 00:00-08:00 UTC Asian session price path shape: clean-trend, clean-v, check, inverted-check, round-trip-spike, or unclassified. Backtested against distribution outcomes (10:30-14:00 UTC) on 2026-06-16: no predictive correlation found. Logged for ongoing research as more history accumulates.';
