-- Migration 052: VT Markets MT5 demo brokers (MetaApi). Links inactive until MT5_ENABLED=true + env configured.
-- Does not alter OANDA rows or behavior.

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
) VALUES
(
  'vtmarkets_omega_demo',
  'mt5',
  'VT Markets MT5 Omega Demo',
  'ENV:METAAPI_TOKEN',
  'ENV:METAAPI_OMEGA_ACCOUNT_ID',
  'demo',
  'https://metaapi.cloud',
  false,
  'disconnected'
),
(
  'vtmarkets_fade_demo',
  'mt5',
  'VT Markets MT5 Fade Demo',
  'ENV:METAAPI_TOKEN',
  'ENV:METAAPI_FADE_ACCOUNT_ID',
  'demo',
  'https://metaapi.cloud',
  false,
  'disconnected'
)
ON CONFLICT (broker_id) DO UPDATE SET
  broker_type = EXCLUDED.broker_type,
  display_name = EXCLUDED.display_name,
  updated_at = NOW();

-- Parallel links: inactive until ops enables MT5 (see docs/MT5_SETUP.md).
INSERT INTO bridge_links (engine_id, broker_id, is_active, capital_allocation_pct)
SELECT 'omega', 'vtmarkets_omega_demo', false, 0.10
WHERE EXISTS (SELECT 1 FROM bridge_brokers WHERE broker_id = 'vtmarkets_omega_demo')
ON CONFLICT (engine_id, broker_id) DO NOTHING;

INSERT INTO bridge_links (engine_id, broker_id, is_active, capital_allocation_pct)
SELECT 'audusd_fade', 'vtmarkets_fade_demo', false, 0.10
WHERE EXISTS (SELECT 1 FROM bridge_brokers WHERE broker_id = 'vtmarkets_fade_demo')
ON CONFLICT (engine_id, broker_id) DO NOTHING;

-- Fade trades: tag which broker executed the row (OANDA legacy rows default oanda_practice).
ALTER TABLE audusd_fade_trades
  ADD COLUMN IF NOT EXISTS broker_id TEXT DEFAULT 'oanda_practice';

CREATE INDEX IF NOT EXISTS idx_audusd_fade_trades_broker_open
  ON audusd_fade_trades (trade_date, pair, broker_id)
  WHERE result IS NULL;

COMMENT ON COLUMN audusd_fade_trades.broker_id IS
  'Execution venue: oanda_practice | vtmarkets_fade_demo | etc. oanda_trade_id holds broker trade/ticket id.';
