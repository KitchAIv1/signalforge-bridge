-- Migration 027: Scalper engine tables.
-- scalper_day_state: one row per trading day, tracks AGREE gate, reference price, ratchet state.
-- scalper_trades: one row per trade, full audit trail including dual P&L accounting.

CREATE TABLE IF NOT EXISTS scalper_day_state (
  id             BIGSERIAL PRIMARY KEY,
  trade_date     DATE        NOT NULL,
  pair           TEXT        NOT NULL DEFAULT 'AUD_USD',
  direction      TEXT        CHECK (direction IN ('long', 'short')),
  reference_price NUMERIC,
  trigger_level  NUMERIC,
  ratchet_count  INTEGER     NOT NULL DEFAULT 0,
  day_stopped    BOOLEAN     NOT NULL DEFAULT false,
  stop_reason    TEXT        CHECK (stop_reason IN ('sl', 'max_ratchets', 'hard_close', 'no_trigger', 'no_agree', 'amd_not_ready')),
  net_pips_day   NUMERIC     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trade_date, pair)
);

CREATE INDEX IF NOT EXISTS idx_scalper_day_state_trade_date
  ON scalper_day_state (trade_date, pair);

COMMENT ON TABLE scalper_day_state IS
  'One row per trading day for the AUD_USD price-ratchet scalper. Reference price = 10:00 UTC bar close.';

COMMENT ON COLUMN scalper_day_state.ratchet_count IS
  'Number of TP-confirmed ratchets fired today. Max = SCALPER_MAX_RATCHETS (default 3).';

COMMENT ON COLUMN scalper_day_state.net_pips_day IS
  'Running sum of pnl_pips (accounting convention) for all closed scalper_trades today. Updated after every trade close.';

CREATE TABLE IF NOT EXISTS scalper_trades (
  id              BIGSERIAL PRIMARY KEY,
  trade_date      DATE        NOT NULL,
  pair            TEXT        NOT NULL DEFAULT 'AUD_USD',
  oanda_trade_id  TEXT,
  direction       TEXT        NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price     NUMERIC     NOT NULL,
  tp_price        NUMERIC     NOT NULL,
  sl_price        NUMERIC     NOT NULL,
  exit_price      NUMERIC,
  pnl_pips        NUMERIC,
  pnl_pips_actual NUMERIC,
  -- pnl_pips: backtest accounting (force_flat = 0, win = +tp_pips, loss = -sl_pips, timeout = actual)
  -- pnl_pips_actual: actual signed pips from entry to fill price (always real)
  result          TEXT        CHECK (result IN ('win', 'loss', 'force_flat', 'force_flat_failed', 'timeout_16h')),
  ratchet_index   INTEGER,
  opened_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  close_reason    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scalper_trades_trade_date
  ON scalper_trades (trade_date, pair);

CREATE INDEX IF NOT EXISTS idx_scalper_trades_open
  ON scalper_trades (trade_date, pair)
  WHERE result IS NULL;

CREATE INDEX IF NOT EXISTS idx_scalper_trades_oanda_id
  ON scalper_trades (oanda_trade_id)
  WHERE oanda_trade_id IS NOT NULL;

COMMENT ON TABLE scalper_trades IS
  'One row per scalper trade. result=NULL means trade is open on OANDA.';

COMMENT ON COLUMN scalper_trades.pnl_pips IS
  'Accounting P&L: force_flat=0, win=+tp_pips, loss=-sl_pips, timeout=actual. Drives net_pips_day.';

COMMENT ON COLUMN scalper_trades.pnl_pips_actual IS
  'Actual signed pips from entry_price to exit_price. Always the real fill-to-fill number.';
