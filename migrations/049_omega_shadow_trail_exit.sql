-- 049_omega_shadow_trail_exit.sql
-- Shadow Trail v1 monitor: hypothetical single-order trail exit on live omega signals.

CREATE TABLE IF NOT EXISTS omega_shadow_trail_exit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id text NOT NULL,
  trade_log_id uuid,
  fired_at timestamptz NOT NULL,
  trade_date date NOT NULL,
  direction text NOT NULL,
  entry_price numeric NOT NULL,
  r_pips numeric NOT NULL,
  r_size_raw numeric NOT NULL,
  session_window text,
  filter_passed boolean NOT NULL DEFAULT false,
  filter_reason text,
  expected_direction text,
  shadow_exit_type text,
  shadow_pips_gross numeric,
  shadow_pips_net numeric,
  shadow_exit_bars integer,
  shadow_win boolean,
  execution_cost_pips numeric NOT NULL DEFAULT 1.2,
  sequenced_status text,
  sequenced_pips_net numeric,
  live_pnl_pips numeric,
  live_result text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT omega_shadow_trail_exit_signal_unique UNIQUE (signal_id)
);

CREATE INDEX IF NOT EXISTS idx_omega_shadow_trail_exit_trade_date
  ON omega_shadow_trail_exit (trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_omega_shadow_trail_exit_fired_at
  ON omega_shadow_trail_exit (fired_at DESC);

COMMENT ON TABLE omega_shadow_trail_exit IS
  'Shadow Trail v1 outcomes on live omega tp1 signals — no OANDA execution.';
