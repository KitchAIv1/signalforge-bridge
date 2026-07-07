-- Lane B: OANDA Phase 2 experiment broker (AUD_NEWWWW) + feature flags + lane_advisory column.
-- Safe to re-run: IF NOT EXISTS / ON CONFLICT DO NOTHING.

ALTER TABLE bridge_trade_log
  ADD COLUMN IF NOT EXISTS lane_advisory TEXT;

COMMENT ON COLUMN bridge_trade_log.lane_advisory IS
  'Omega Lane B shadow-tier gate advisory (R1/Phase2 would-block reason). Null for Lane A rows.';

INSERT INTO bridge_brokers (
  broker_id,
  broker_type,
  display_name,
  api_token_encrypted,
  account_id,
  environment,
  api_base_url,
  is_active
)
VALUES (
  'oanda_phase2_demo',
  'oanda',
  'AUD_NEWWWW',
  'ENV:OANDA_API_TOKEN',
  '101-001-38709456-003',
  'practice',
  'https://api-fxpractice.oanda.com',
  true
)
ON CONFLICT (broker_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  account_id = EXCLUDED.account_id,
  is_active = true,
  updated_at = NOW();

INSERT INTO bridge_links (engine_id, broker_id, is_active, capital_allocation_pct)
VALUES ('omega', 'oanda_phase2_demo', true, 1.0)
ON CONFLICT (engine_id, broker_id) DO UPDATE SET
  is_active = true,
  capital_allocation_pct = 1.0,
  updated_at = NOW();

-- Experiment: disable VT omega fan-out (Lane A = oanda_practice only + Lane B).
UPDATE bridge_links
SET is_active = false, updated_at = NOW()
WHERE engine_id = 'omega' AND broker_id = 'vtmarkets_omega_demo';

INSERT INTO bridge_config (config_key, config_value, description, category)
VALUES
  (
    'omega_lane_b_r1_enforce',
    to_jsonb(false),
    'Lane B: enforce R1 opposite-flip block after small trail (00-05 UTC)',
    'omega_lane_b'
  ),
  (
    'omega_lane_b_phase2_shadow',
    to_jsonb(true),
    'Lane B: log Phase2 dist-skip advisories without blocking (W0 default)',
    'omega_lane_b'
  ),
  (
    'omega_lane_b_phase2_enforce',
    to_jsonb(false),
    'Lane B: enforce Phase2 dist skip when twoPlusFlags by 10:31',
    'omega_lane_b'
  )
ON CONFLICT (config_key) DO NOTHING;
