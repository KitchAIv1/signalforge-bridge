-- Migration 075: Peak Fade engine (D1 extreme fade, TP9, no SL).
-- Isolated from Omega/AO/Fade/AMD. VT fan-out ready via optional broker + links.
-- Engine defaults inactive; runtime also requires PEAK_FADE_ENABLED=true.

CREATE TABLE IF NOT EXISTS peak_fade_trades (
  id                   BIGSERIAL PRIMARY KEY,
  trade_date           DATE        NOT NULL,
  pair                 TEXT        NOT NULL DEFAULT 'AUD_USD',
  broker_id            TEXT,
  broker_trade_id      TEXT,
  units                INTEGER,
  direction            TEXT        NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price          NUMERIC     NOT NULL,
  tp_price             NUMERIC     NOT NULL,
  ref_day_key          TEXT,
  ref_extreme          NUMERIC,
  near_pips            NUMERIC,
  trend_progress_pips  NUMERIC,
  exit_price           NUMERIC,
  pnl_pips             NUMERIC,
  pnl_pips_actual      NUMERIC,
  result               TEXT        CHECK (result IN ('win', 'loss', 'force_close', 'external_close')),
  opened_at            TIMESTAMPTZ,
  closed_at            TIMESTAMPTZ,
  close_reason         TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_peak_fade_trades_trade_date
  ON peak_fade_trades (trade_date, pair);

CREATE INDEX IF NOT EXISTS idx_peak_fade_trades_open
  ON peak_fade_trades (pair)
  WHERE result IS NULL;

CREATE INDEX IF NOT EXISTS idx_peak_fade_trades_broker_open
  ON peak_fade_trades (broker_id, pair)
  WHERE result IS NULL;

COMMENT ON TABLE peak_fade_trades IS
  'Peak Fade: fade prior D1 high/low after push-into-extreme; broker TP; no SL; per-broker rows for OANDA+VT fan-out.';

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
  'peak_fade',
  'sf_eng_' || gen_random_uuid(),
  'Peak Fade',
  0.10,
  false,
  0,
  20,
  72,
  7,
  'AUDUSD peak-fade: prior D1 extreme + trend-into-peak, TP9 no SL, high-impact news T-2h/T+1h block, equity-proportional size, VT fan-out ready'
) ON CONFLICT (engine_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  updated_at = NOW();

INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'peak_fade_enabled',
  to_jsonb(false),
  'Peak Fade master kill-switch (also requires PEAK_FADE_ENABLED=true env)',
  'peak_fade'
)
ON CONFLICT (config_key) DO NOTHING;

-- Optional VT demo broker stub (inactive until MetaApi account provisioned).
INSERT INTO bridge_brokers (
  broker_id,
  broker_type,
  display_name,
  api_token_encrypted,
  account_id,
  environment,
  api_base_url,
  is_active,
  connection_status
) VALUES (
  'vtmarkets_peak_fade_demo',
  'mt5',
  'VT Markets Peak Fade Demo',
  'ENV:METAAPI_TOKEN',
  'ENV:METAAPI_PEAK_FADE_ACCOUNT_ID',
  'demo',
  'https://metaapi.cloud',
  false,
  'disconnected'
)
ON CONFLICT (broker_id) DO NOTHING;

-- Dashboard read policy (anon) when RLS is used.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'peak_fade_trades'
  ) THEN
    ALTER TABLE public.peak_fade_trades ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "dashboard_select_peak_fade_trades" ON public.peak_fade_trades;
    CREATE POLICY "dashboard_select_peak_fade_trades"
      ON public.peak_fade_trades FOR SELECT
      USING (true);
  END IF;
END $$;
