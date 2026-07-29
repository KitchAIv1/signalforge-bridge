-- Migration 067: PDL Window bidirectional + SL 5p / 13:00 / weight 0.72
-- SHORT on all-false or all-true; LONG otherwise; hold 12:00–13:00 UTC.

ALTER TABLE pdl_window_trades
  DROP CONSTRAINT IF EXISTS pdl_window_trades_direction_check;

ALTER TABLE pdl_window_trades
  ADD CONSTRAINT pdl_window_trades_direction_check
  CHECK (direction IN ('long', 'short'));

COMMENT ON TABLE pdl_window_trades IS
  'PDL Window engine trades — LONG/SHORT 12:00–13:00 UTC, SL 5p, VT spread 1.5p netted in pnl_pips. result=NULL means open.';

UPDATE bridge_engines
SET
  weight = 0.72,
  max_hold_hours = 1,
  description = 'PDL Window — always trade 12:00–13:00 UTC; SHORT if PDL✗·LDN✗·H11✗ or all-true; else LONG; hard SL 5p; VT spread 1.5p; shares Fade OANDA/MT5',
  updated_at = NOW()
WHERE engine_id = 'pdl_window';

GRANT SELECT ON pdl_window_trades TO anon, authenticated;
