-- AMD audit trail — v2.4.1
-- Adds reversal_confirmed and auto_direction_reason to bridge_trade_log
-- so every trade row is fully self-explanatory without joining amd_state.
-- Safe to re-run: IF NOT EXISTS.

ALTER TABLE bridge_trade_log
  ADD COLUMN IF NOT EXISTS reversal_confirmed boolean,
  ADD COLUMN IF NOT EXISTS auto_direction_reason text;
