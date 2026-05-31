-- Migration 028: Asian session M5 candles (00:00–08:00 UTC) for Asian scalper backtest.

CREATE TABLE IF NOT EXISTS asian_m5_candles (
  id            BIGSERIAL PRIMARY KEY,
  trade_date    DATE NOT NULL,
  pair          TEXT NOT NULL DEFAULT 'AUD_USD',
  candles       JSONB NOT NULL DEFAULT '[]',
  candle_count  INTEGER NOT NULL DEFAULT 0,
  fetch_status  TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  fetched_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trade_date, pair)
);

CREATE INDEX IF NOT EXISTS idx_asian_m5_candles_trade_date
  ON asian_m5_candles (trade_date, pair);

CREATE INDEX IF NOT EXISTS idx_asian_m5_candles_fetch_status
  ON asian_m5_candles (fetch_status);

COMMENT ON TABLE asian_m5_candles IS
  'M5 OHLC candles for Asian session window (00:00–08:00 UTC) per trading day.';
