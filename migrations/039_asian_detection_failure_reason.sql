-- Asian session detection diagnostic columns for NO_DETECTION rows
-- Safe to re-run: IF NOT EXISTS

ALTER TABLE asian_session_detection_log
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS evaluated_net_pips NUMERIC,
  ADD COLUMN IF NOT EXISTS evaluated_direction TEXT;

COMMENT ON COLUMN asian_session_detection_log.failure_reason IS
  'Why detection failed: BELOW_THRESHOLD | ADVERSE_BAR | NO_MOMENTUM | NO_RETEST | NO_EARLY_EXTREME | INSUFFICIENT_CANDLES';
COMMENT ON COLUMN asian_session_detection_log.evaluated_net_pips IS
  'Net pips computed at evaluation time, even on non-detection';
COMMENT ON COLUMN asian_session_detection_log.evaluated_direction IS
  'Direction evaluated before gate rejection';
