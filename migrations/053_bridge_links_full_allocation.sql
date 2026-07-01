-- Migration 053: Full risk allocation (1.0) per broker — separate accounts size independently.
-- OANDA + VT each get full engine risk on their own equity (not a split pool).

-- Omega: ensure OANDA parallel link + full allocation on both venues
INSERT INTO bridge_links (engine_id, broker_id, is_active, capital_allocation_pct)
VALUES ('omega', 'oanda_practice', true, 1.0)
ON CONFLICT (engine_id, broker_id) DO UPDATE SET
  capital_allocation_pct = 1.0,
  updated_at = NOW();

UPDATE bridge_links
SET capital_allocation_pct = 1.0, updated_at = NOW()
WHERE engine_id = 'omega' AND broker_id = 'vtmarkets_omega_demo';

-- AUD_FADE: full allocation on OANDA + VT
UPDATE bridge_links
SET capital_allocation_pct = 1.0, updated_at = NOW()
WHERE engine_id = 'audusd_fade'
  AND broker_id IN ('oanda_practice', 'vtmarkets_fade_demo');

INSERT INTO bridge_links (engine_id, broker_id, is_active, capital_allocation_pct)
SELECT 'audusd_fade', 'vtmarkets_fade_demo', false, 1.0
WHERE EXISTS (SELECT 1 FROM bridge_brokers WHERE broker_id = 'vtmarkets_fade_demo')
ON CONFLICT (engine_id, broker_id) DO UPDATE SET
  capital_allocation_pct = 1.0,
  updated_at = NOW();
