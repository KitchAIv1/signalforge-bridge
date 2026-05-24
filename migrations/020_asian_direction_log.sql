-- Asian Direction automation log (omega_direction set + Asian session close)
-- Apply in Supabase SQL editor before enabling AsianDirectionService crons

CREATE TABLE IF NOT EXISTS asian_direction_log (
  id bigserial PRIMARY KEY,
  trade_date date NOT NULL,
  triggered_at timestamptz NOT NULL,
  trigger_type text NOT NULL,
  amd_tag text,
  prior_d1_direction text,
  prior_d1_body_pips numeric,
  prior_d1_close numeric,
  direction_set text,
  previous_direction text,
  direction_changed boolean,
  action text NOT NULL,
  reason text,
  positions_closed integer,
  asian_session_result text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asian_direction_log_trade_date
  ON asian_direction_log (trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_asian_direction_log_trigger_type
  ON asian_direction_log (trigger_type);
