-- 047_bridge_trade_log_ratchet_legs.sql
-- Allow omega ratchet legs (tp1 / tp2 / trail) to coexist for one signal_id.
--
-- ROOT CAUSE: a unique index `idx_bridge_trade_log_signal` on (signal_id)
-- rejected the 2nd and 3rd leg inserts of every omega ratchet trade, so only
-- the tp1 leg was ever logged (tp2 + trail executed on OANDA but were dropped
-- on insert with duplicate-key 23505). This broke per-signal P&L aggregation
-- and left trail legs unregistered in trail_stop_state.
--
-- FIX: replace the signal_id-only uniqueness with a composite unique on
-- (signal_id, COALESCE(leg_type,'none')). Single-row engines (leg_type NULL)
-- still dedup as before via the 'none' sentinel; omega writes three distinct
-- leg rows per signal.
--
-- Safe to re-run. No data loss — only tp1 rows exist today, so the new index
-- builds without conflict.

BEGIN;

-- Drop the old uniqueness whether it was created as an index or a constraint.
ALTER TABLE bridge_trade_log
  DROP CONSTRAINT IF EXISTS idx_bridge_trade_log_signal;
DROP INDEX IF EXISTS idx_bridge_trade_log_signal;

-- New composite uniqueness: one row per (signal, leg).
CREATE UNIQUE INDEX IF NOT EXISTS idx_bridge_trade_log_signal_leg
  ON bridge_trade_log (signal_id, COALESCE(leg_type, 'none'));

COMMIT;
