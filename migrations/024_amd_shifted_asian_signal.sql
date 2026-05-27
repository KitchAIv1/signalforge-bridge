-- Migration 024: AMD_SHIFTED Asian dominance signal
-- Stores ratio columns computed at 10:31 UTC for
-- AMD_SHIFTED neutral days where Asian drift
-- dominates the Judas swing.
-- judas_to_range_ratio: judas_pips / asian_range_pips
--   < 0.20 = weak Judas relative to Asian move
-- asian_drift_ratio: abs(asian_net_pips) / asian_range_pips
--   > 0.50 = strong directional Asian drift
-- asian_dominance_ratio: abs(asian_net_pips) / judas_pips
--   > 2.0 = Asian move dominates Judas
-- market_structure_type: classification result
--   ASIAN_DOMINANT | JUDAS_DOMINANT | MIXED
-- asian_net_direction: long | short | neutral
--   derived from asian_net_pips sign

ALTER TABLE amd_state
  ADD COLUMN IF NOT EXISTS
    judas_to_range_ratio numeric,
  ADD COLUMN IF NOT EXISTS
    asian_drift_ratio numeric,
  ADD COLUMN IF NOT EXISTS
    asian_dominance_ratio numeric,
  ADD COLUMN IF NOT EXISTS
    market_structure_type text,
  ADD COLUMN IF NOT EXISTS
    asian_net_direction text;
