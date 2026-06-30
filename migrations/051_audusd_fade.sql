-- Migration 051: AUDUSD Fade engine.
-- audusd_fade_trades: one row per fade trade, full audit trail with dual P&L accounting.
-- Self-contained in-bridge paper engine (OANDA practice). Mirrors closed trades into
-- bridge_trade_log for Activity visibility. Mirror of the scalper pattern (migrations 027 + 029).

CREATE TABLE IF NOT EXISTS audusd_fade_trades (
  id              BIGSERIAL PRIMARY KEY,
  trade_date      DATE        NOT NULL,
  pair            TEXT        NOT NULL DEFAULT 'AUD_USD',
  oanda_trade_id  TEXT,
  units           INTEGER,
  direction       TEXT        NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price     NUMERIC     NOT NULL,
  tp_price        NUMERIC     NOT NULL,
  sl_price        NUMERIC     NOT NULL,
  exit_price      NUMERIC,
  pnl_pips        NUMERIC,
  pnl_pips_actual NUMERIC,
  -- pnl_pips: accounting convention (win = +target_pips, loss = -stop_pips, else = actual)
  -- pnl_pips_actual: actual signed pips from entry_price to exit fill (always real)
  result          TEXT        CHECK (result IN ('win', 'loss', 'max_hold', 'force_close')),
  ext_pips        NUMERIC,    -- |close - SMA50| at entry (signed: + = up-extension faded short)
  aligned_eur     NUMERIC,    -- EURUSD aligned 48-bar momentum at entry (pips)
  opened_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  close_reason    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audusd_fade_trades_trade_date
  ON audusd_fade_trades (trade_date, pair);

CREATE INDEX IF NOT EXISTS idx_audusd_fade_trades_open
  ON audusd_fade_trades (trade_date, pair)
  WHERE result IS NULL;

CREATE INDEX IF NOT EXISTS idx_audusd_fade_trades_oanda_id
  ON audusd_fade_trades (oanda_trade_id)
  WHERE oanda_trade_id IS NOT NULL;

COMMENT ON TABLE audusd_fade_trades IS
  'One row per AUDUSD fade trade. result=NULL means trade is open on OANDA. EURUSD-gated SMA50 mean reversion.';

COMMENT ON COLUMN audusd_fade_trades.pnl_pips IS
  'Accounting P&L: win=+target_pips, loss=-stop_pips, else=actual. Drives mirror pnl_pips.';

COMMENT ON COLUMN audusd_fade_trades.pnl_pips_actual IS
  'Actual signed pips from entry_price to exit_price. Always the real fill-to-fill number.';

-- Register engine in bridge_engines for Activity filter + overview cards (clone of migration 029).
INSERT INTO bridge_engines (
  engine_id,
  engine_key,
  display_name,
  weight,
  is_active,
  execution_threshold,
  max_daily_trades,
  max_hold_hours,
  priority,
  description
) VALUES (
  'audusd_fade',
  'sf_eng_' || gen_random_uuid(),
  'AUDUSD Fade',
  0.10,
  true,
  0,
  2,
  4,
  6,
  'AUDUSD EURUSD-gated SMA50 mean-reversion fade — |close-SMA50|>=30p, T10/S15, EUR aligned 48-bar gate >= -50, max 2/day'
) ON CONFLICT (engine_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_active = EXCLUDED.is_active,
  execution_threshold = EXCLUDED.execution_threshold,
  max_daily_trades = EXCLUDED.max_daily_trades,
  max_hold_hours = EXCLUDED.max_hold_hours,
  priority = EXCLUDED.priority,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Link to OANDA practice broker for consistency (clone of migration 006).
INSERT INTO bridge_links (engine_id, broker_id, is_active, capital_allocation_pct)
SELECT 'audusd_fade', 'oanda_practice', true, 0.10
WHERE EXISTS (SELECT 1 FROM bridge_brokers WHERE broker_id = 'oanda_practice')
ON CONFLICT (engine_id, broker_id) DO UPDATE SET is_active = true, capital_allocation_pct = 0.10;
