-- Migration 065: Shadow AO — isolated streak/position for over-threshold count.
-- Live alpha_omega_streak_state (id=1) and OMEGA_AO_BROKER_IDS are untouched.
-- Paper broker ao_shadow_paper must NEVER join live AO fan-out lists.

CREATE TABLE IF NOT EXISTS alpha_omega_shadow_streak_state (
  id                      INTEGER PRIMARY KEY DEFAULT 1,
  current_streak_direction TEXT,
  current_streak_length    INTEGER NOT NULL DEFAULT 0,
  current_streak_start_at  TIMESTAMPTZ,
  last_fire_at             TIMESTAMPTZ,
  armed                    BOOLEAN NOT NULL DEFAULT FALSE,
  armed_direction          TEXT,
  last_processed_signal_id UUID,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT alpha_omega_shadow_streak_state_singleton CHECK (id = 1)
);

INSERT INTO alpha_omega_shadow_streak_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE alpha_omega_shadow_streak_state IS
  'Shadow AO streak — isolated from live id=1. Counts matched + over-threshold fires.';

CREATE TABLE IF NOT EXISTS alpha_omega_shadow_position_state (
  paper_trade_id      TEXT PRIMARY KEY,
  broker_id           TEXT NOT NULL DEFAULT 'ao_shadow_paper',
  direction           TEXT NOT NULL,
  entry_fired_at      TIMESTAMPTZ NOT NULL,
  entry_price         NUMERIC,
  opposing_fire_count INTEGER NOT NULL DEFAULT 0,
  total_fire_count    INTEGER NOT NULL DEFAULT 0,
  peak_favorable_pips NUMERIC NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alpha_omega_shadow_position_broker
  ON alpha_omega_shadow_position_state (broker_id);

COMMENT ON TABLE alpha_omega_shadow_position_state IS
  'Shadow AO paper open positions — never broker-executed.';

INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES (
  'alpha_omega_shadow_enabled',
  to_jsonb(false),
  'Shadow AO kill switch — false disables over-threshold streak/paper (live AO unaffected)',
  'alpha_omega'
)
ON CONFLICT (config_key) DO NOTHING;

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
  'ao_shadow_paper',
  'paper',
  'AO Shadow Paper',
  NULL,
  NULL,
  'paper',
  'paper://ao-shadow',
  false,
  'disconnected'
)
ON CONFLICT (broker_id) DO NOTHING;
