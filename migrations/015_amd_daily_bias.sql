-- AMD daily bias (D1 vote + Judas alignment) — advisory columns.
-- Already applied manually in Supabase for live DBs; kept here for repo parity.
-- Safe to re-run: IF NOT EXISTS skips existing columns.

ALTER TABLE amd_state
  ADD COLUMN IF NOT EXISTS layer4_d1_bias text,
  ADD COLUMN IF NOT EXISTS layer4_bullish_count integer,
  ADD COLUMN IF NOT EXISTS layer4_bearish_count integer,
  ADD COLUMN IF NOT EXISTS daily_bias_alignment text;

ALTER TABLE bridge_trade_log
  ADD COLUMN IF NOT EXISTS layer4_d1_bias text,
  ADD COLUMN IF NOT EXISTS daily_bias_alignment text;
