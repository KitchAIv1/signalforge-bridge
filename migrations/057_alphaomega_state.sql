-- Migration 057: ALPHAOMEGA (Omega Lane B rewire) state tables.
-- Lane A (oanda_practice) is completely untouched by this migration.
-- Lane B (oanda_phase2_demo) gets its own streak-tracking + position state,
-- replacing the R1/Phase2 gates as the live entry/exit decision source.

-- Global running streak state — ONE row, tracks the continuous omega fire
-- stream (all decisions: EXECUTED/BLOCKED/SKIPPED, matching the validated
-- research methodology). Not per-broker: the underlying signal stream is a
-- single market-wide sequence shared by all lanes.
CREATE TABLE IF NOT EXISTS alpha_omega_streak_state (
  id                      INTEGER PRIMARY KEY DEFAULT 1,
  current_streak_direction TEXT,
  current_streak_length    INTEGER NOT NULL DEFAULT 0,
  current_streak_start_at  TIMESTAMPTZ,
  last_fire_at             TIMESTAMPTZ,
  armed                    BOOLEAN NOT NULL DEFAULT FALSE,
  armed_direction          TEXT,
  last_processed_signal_id UUID,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT alpha_omega_streak_state_singleton CHECK (id = 1)
);

INSERT INTO alpha_omega_streak_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE alpha_omega_streak_state IS
  'ALPHAOMEGA live streak tracker — singleton row. Incremental state machine '
  'mirroring the validated backtest (streak>=7 within <=45min then flip = crack). '
  'Drives both Lane B entry (crack + speed floor) and backstop-crack exit.';

-- Per-open-position state for Lane B trades — opposing-fire count since entry.
CREATE TABLE IF NOT EXISTS alpha_omega_position_state (
  oanda_trade_id      TEXT PRIMARY KEY,
  broker_id           TEXT NOT NULL,
  direction           TEXT NOT NULL,
  entry_fired_at      TIMESTAMPTZ NOT NULL,
  entry_price         NUMERIC,
  opposing_fire_count INTEGER NOT NULL DEFAULT 0,
  total_fire_count    INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alpha_omega_position_state_broker
  ON alpha_omega_position_state (broker_id);

COMMENT ON TABLE alpha_omega_position_state IS
  'ALPHAOMEGA open-position tracking for opposing-fire-count exit (>=5 triggers close). '
  'One row per open Lane B position; deleted on close.';

-- Kill switch (default enabled per user decision to enforce immediately).
INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'alpha_omega_enabled',
  to_jsonb(true),
  'ALPHAOMEGA (Omega Lane B rewire) master kill switch — false disables entry+exit and falls back to legacy Lane B behavior',
  'alpha_omega'
)
ON CONFLICT (config_key) DO NOTHING;
