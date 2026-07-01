-- 054_bridge_trade_log_broker_aware_dedup.sql
-- Broker-aware dedup for bridge_trade_log so omega multi-broker fan-out
-- (OANDA + VT/MT5) can log BOTH executions of a single signal.
--
-- ROOT CAUSE
--   idx_bridge_trade_log_signal_leg (migration 047) is UNIQUE on
--     (signal_id, COALESCE(leg_type, 'none'))
--   with no broker dimension. When omega fans out to 2 brokers on the same
--   signal_id with leg_type = NULL, both inserts map to the same key. The 2nd
--   insert is rejected (23505). Because the broker order is PLACED before the
--   log row is written, that broker's live trade is left untracked (orphan).
--
-- FIX
--   Add COALESCE(broker_id, 'none') to the composite unique index. This keeps
--   the "one row per (signal, leg)" guarantee PER BROKER while allowing distinct
--   brokers to each log their own execution of the same signal.
--
-- SAFETY / NON-BREAKING
--   * Adding a 3rd column only makes keys strictly MORE unique. Every existing
--     row already satisfies the 2-column uniqueness, so the 3-column index
--     builds against current data with zero conflicts.
--   * No INSERT uses ON CONFLICT against this index (it is a pure guard), so
--     widening it cannot reject any insert that previously succeeded.
--   * New index is created BEFORE the old one is dropped, so uniqueness
--     protection is never absent.
--   * Idempotent / safe to re-run.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bridge_trade_log_signal_leg_broker
  ON bridge_trade_log (
    signal_id,
    COALESCE(leg_type, 'none'),
    COALESCE(broker_id, 'none')
  );

DROP INDEX IF EXISTS idx_bridge_trade_log_signal_leg;

COMMIT;
