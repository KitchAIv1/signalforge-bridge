-- Regime state table: one row written per pair per H4 evaluation
-- (Numbered 011 because 010_rebuild_hour_gate.sql already exists in repo.)

CREATE TABLE IF NOT EXISTS regime_state (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pair                     text        NOT NULL,
  evaluated_at             timestamptz NOT NULL DEFAULT now(),
  regime_direction         text        NOT NULL,
  regime_confidence        text        NOT NULL,
  choppy_extended_override boolean     NOT NULL DEFAULT false,
  layer4_result            text,
  layer4_bullish_count     integer,
  layer4_bearish_count     integer,
  layer5_result            text,
  layer5_pip_diff          integer,
  layer6_position_pct      integer,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regime_state_pair_evaluated
  ON regime_state (pair, evaluated_at DESC);

ALTER TABLE bridge_trade_log
  ADD COLUMN IF NOT EXISTS regime_direction       text,
  ADD COLUMN IF NOT EXISTS regime_confidence      text,
  ADD COLUMN IF NOT EXISTS regime_evaluated_at    timestamptz,
  ADD COLUMN IF NOT EXISTS regime_size_multiplier numeric;
