-- Migration 061: PDL Window live engine (shares Fade OANDA + MT5 venues).
-- Always-LONG 12:00–15:00 UTC unless all three PDL conditions are false.
-- Hard SL 20 pips. Own trades table; does not modify audusd_fade.

CREATE TABLE IF NOT EXISTS pdl_window_trades (
  id              BIGSERIAL PRIMARY KEY,
  trade_date      DATE        NOT NULL,
  pair            TEXT        NOT NULL DEFAULT 'AUD_USD',
  broker_id       TEXT        NOT NULL DEFAULT 'oanda_practice',
  oanda_trade_id  TEXT,
  units           INTEGER,
  direction       TEXT        NOT NULL CHECK (direction IN ('long')),
  entry_price     NUMERIC     NOT NULL,
  sl_price        NUMERIC     NOT NULL,
  exit_price      NUMERIC,
  pnl_pips        NUMERIC,
  pnl_dollars     NUMERIC,
  pnl_r           NUMERIC,
  result          TEXT        CHECK (result IN ('win', 'loss', 'breakeven', 'time_exit', 'force_close')),
  close_reason    TEXT,
  conditions_met  JSONB,
  block_reason    TEXT,
  opened_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdl_window_trades_trade_date
  ON pdl_window_trades (trade_date, pair);

CREATE INDEX IF NOT EXISTS idx_pdl_window_trades_open
  ON pdl_window_trades (trade_date, pair, broker_id)
  WHERE result IS NULL;

CREATE INDEX IF NOT EXISTS idx_pdl_window_trades_oanda_id
  ON pdl_window_trades (oanda_trade_id)
  WHERE oanda_trade_id IS NOT NULL;

COMMENT ON TABLE pdl_window_trades IS
  'PDL Window engine trades — LONG 12:00–15:00 UTC, SL 20p. result=NULL means open.';

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
  'pdl_window',
  'sf_eng_' || gen_random_uuid(),
  'PDL Window',
  0.10,
  true,
  0,
  1,
  3,
  7,
  'PDL Window — always LONG 12:00–15:00 UTC unless PDL✗·LDN✗·H11✗; hard SL 20p; shares Fade OANDA/MT5'
) ON CONFLICT (engine_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_active = EXCLUDED.is_active,
  execution_threshold = EXCLUDED.execution_threshold,
  max_daily_trades = EXCLUDED.max_daily_trades,
  max_hold_hours = EXCLUDED.max_hold_hours,
  priority = EXCLUDED.priority,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Share Fade OANDA venue label (account resolved via AUDUSD_FADE_OANDA_ACCOUNT_ID for pdl_window).
INSERT INTO bridge_links (engine_id, broker_id, is_active, capital_allocation_pct)
SELECT 'pdl_window', 'oanda_practice', true, 1.0
WHERE EXISTS (SELECT 1 FROM bridge_brokers WHERE broker_id = 'oanda_practice')
ON CONFLICT (engine_id, broker_id) DO UPDATE SET
  is_active = true,
  capital_allocation_pct = 1.0;

-- MT5: match Fade's link active state (do not force-enable if Fade VT is inactive).
INSERT INTO bridge_links (engine_id, broker_id, is_active, capital_allocation_pct)
SELECT
  'pdl_window',
  'vtmarkets_fade_demo',
  COALESCE(
    (SELECT is_active FROM bridge_links
     WHERE engine_id = 'audusd_fade' AND broker_id = 'vtmarkets_fade_demo'
     LIMIT 1),
    false
  ),
  1.0
WHERE EXISTS (SELECT 1 FROM bridge_brokers WHERE broker_id = 'vtmarkets_fade_demo')
ON CONFLICT (engine_id, broker_id) DO NOTHING;
