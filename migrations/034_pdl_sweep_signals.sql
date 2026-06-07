-- PDL sweep reversal shadow signal — detection at 11:55 UTC, outcome at 13:05 UTC.

CREATE TABLE IF NOT EXISTS pdl_sweep_signals (
  id bigserial PRIMARY KEY,
  trade_date date NOT NULL,
  pair text NOT NULL DEFAULT 'AUD_USD',

  prior_day_low numeric(10,5),
  price_at_1155 numeric(10,5),
  pdl_sweep_depth_pips numeric(6,1),
  london_net_pips numeric(6,1),
  london_direction text,
  h11_net_pips numeric(6,1),
  h11_direction text,

  signal_fired boolean NOT NULL DEFAULT false,
  signal_direction text,
  conditions_met jsonb,

  amd_outcome_tag text,
  decision_auto_direction text,
  auto_direction_confidence text,

  outcome_h12_net_pips numeric(6,1),
  outcome_h12_direction text,
  outcome_evaluated_at timestamptz,

  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(trade_date, pair)
);

CREATE INDEX IF NOT EXISTS pdl_sweep_signals_trade_date_idx
  ON pdl_sweep_signals (trade_date);

CREATE INDEX IF NOT EXISTS pdl_sweep_signals_signal_fired_idx
  ON pdl_sweep_signals (signal_fired);

COMMENT ON TABLE pdl_sweep_signals IS
  'Shadow PDL sweep reversal signal — BELOW_PDL + London DOWN + h11 UP at 11:55 UTC.';
