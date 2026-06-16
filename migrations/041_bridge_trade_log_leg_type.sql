ALTER TABLE bridge_trade_log
ADD COLUMN leg_type TEXT;

COMMENT ON COLUMN bridge_trade_log.leg_type IS
  'For multi-leg engines (e.g. omega ratchet): tp1, tp2, trail. NULL for single-leg trades.';
