CREATE TABLE IF NOT EXISTS d1_candles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_date date NOT NULL,
  pair text NOT NULL DEFAULT 'AUD_USD',
  -- Raw OANDA D1 candle prices
  open_price numeric NOT NULL,
  high_price numeric NOT NULL,
  low_price numeric NOT NULL,
  close_price numeric NOT NULL,
  -- Computed fields
  net_pips numeric NOT NULL,        -- (close - open) * 10000
  range_pips numeric NOT NULL,      -- (high - low) * 10000
  direction text NOT NULL,          -- 'long' | 'short' | 'equal'
  close_position_pct numeric,       -- 0-100: where close sits in range
  body_pct numeric,                 -- |close-open|/range * 100
  upper_wick_pct numeric,           -- wick above body / range * 100
  lower_wick_pct numeric,           -- wick below body / range * 100
  -- Metadata
  candle_time text,                 -- OANDA candle time ISO
  fetched_at timestamptz DEFAULT now(),
  UNIQUE(trade_date, pair)
);

CREATE INDEX IF NOT EXISTS idx_d1_candles_trade_date
  ON d1_candles(trade_date);
