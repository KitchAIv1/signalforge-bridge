-- Add duration_minutes to bridge_trade_log for closed trades.
ALTER TABLE bridge_trade_log ADD COLUMN IF NOT EXISTS duration_minutes NUMERIC;
