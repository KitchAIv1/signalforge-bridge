-- Asian session intraday detection log + prior-day AMD flag bridge_config keys
-- Apply in Supabase SQL editor before deploying AsianSessionDetectionService
-- Safe to re-run: IF NOT EXISTS / ON CONFLICT DO NOTHING

CREATE TABLE IF NOT EXISTS asian_session_detection_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_date date NOT NULL,
  pair text NOT NULL DEFAULT 'AUD_USD',

  condition_fired text,
  condition_check_time text,
  detection_bar integer,
  detection_direction text,
  detection_net_pips numeric,

  prior_amd_shifted boolean NOT NULL DEFAULT false,
  prior_amd_tag text,
  size_multiplier numeric,

  action text NOT NULL,
  direction_set text,
  valid_until timestamptz,

  candle_count integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asian_session_detection_log_unique
  ON asian_session_detection_log (trade_date, pair, condition_check_time);

CREATE INDEX IF NOT EXISTS idx_asian_session_detection_log_trade_date
  ON asian_session_detection_log (trade_date, pair);

INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES
  (
    'asian_prior_amd_shifted',
    to_jsonb('false'::text),
    'Prior trading day AMD_SHIFTED flag for Asian session sizing (set at 21:10 UTC)',
    'system'
  ),
  (
    'asian_prior_amd_tag',
    to_jsonb(''::text),
    'Prior trading day amd_tag value for Asian session context (set at 21:10 UTC)',
    'system'
  )
ON CONFLICT (config_key) DO NOTHING;
