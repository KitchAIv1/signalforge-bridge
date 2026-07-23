-- Migration 063: VT Markets live MT5 broker for ALPHAOMEGA dual-book (INSERT only).
-- Does not alter schema. Does not touch oanda_phase2_demo or vtmarkets_omega_demo.
-- Link stays inactive until Settings guided bind (or ops) activates it.

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
  'vtmarkets_ao_live',
  'mt5',
  'VT Markets MT5 ALPHAOMEGA Live',
  'ENV:METAAPI_TOKEN',
  NULL,
  'live',
  'https://metaapi.cloud',
  false,
  'disconnected'
)
ON CONFLICT (broker_id) DO UPDATE SET
  broker_type = EXCLUDED.broker_type,
  display_name = EXCLUDED.display_name,
  environment = EXCLUDED.environment,
  api_base_url = EXCLUDED.api_base_url,
  updated_at = NOW();

INSERT INTO bridge_links (engine_id, broker_id, is_active, capital_allocation_pct)
SELECT 'omega', 'vtmarkets_ao_live', false, 1.0
WHERE EXISTS (SELECT 1 FROM bridge_brokers WHERE broker_id = 'vtmarkets_ao_live')
ON CONFLICT (engine_id, broker_id) DO NOTHING;
