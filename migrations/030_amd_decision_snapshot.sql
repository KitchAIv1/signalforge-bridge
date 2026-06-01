-- Migration 030: Immutable 10:31 decision snapshot on amd_state.
-- decision_auto_direction is written once per day (first detection) and never overwritten by reruns.

ALTER TABLE amd_state
  ADD COLUMN IF NOT EXISTS decision_auto_direction text,
  ADD COLUMN IF NOT EXISTS decision_evaluated_at timestamptz;

COMMENT ON COLUMN amd_state.decision_auto_direction IS
  'Frozen auto_direction at first 10:31 UTC detection — never overwritten by bridge reruns.';
COMMENT ON COLUMN amd_state.decision_evaluated_at IS
  'Timestamp of first detection when decision_auto_direction was frozen.';
