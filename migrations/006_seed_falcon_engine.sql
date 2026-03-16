-- Falcon Bridge Integration — Insert Falcon into bridge_engines
-- Falcon v0.36: NY session momentum scalper — GBPUSD, USDJPY, GBPJPY — 14:15 + 15:45 UTC

-- Add description column (optional metadata; not used by Bridge logic)
ALTER TABLE bridge_engines ADD COLUMN IF NOT EXISTS description TEXT;

INSERT INTO bridge_engines (
  engine_id,
  engine_key,
  display_name,
  weight,
  is_active,
  execution_threshold,
  max_daily_trades,
  max_hold_hours,
  priority,
  description
) VALUES (
  'falcon',
  'sf_eng_' || gen_random_uuid(),
  'Falcon v0.36',
  0.25,        -- weight; rebalance other engines if needed
  true,
  10,          -- R:R 1.0 × 10 = 10 minimum score
  6,           -- max 6 trades per day (3 pairs × 2 windows)
  2,           -- max hold 2 hours per v0.36 config
  4,           -- priority (lower = higher priority; falcon below alpha/charlie/delta)
  'NY session momentum scalper — GBPUSD, USDJPY, GBPJPY — 14:15 + 15:45 UTC'
) ON CONFLICT (engine_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_active = EXCLUDED.is_active,
  execution_threshold = EXCLUDED.execution_threshold,
  max_daily_trades = EXCLUDED.max_daily_trades,
  max_hold_hours = EXCLUDED.max_hold_hours,
  priority = EXCLUDED.priority,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Optional: link Falcon to OANDA (for consistency with alpha/charlie/delta)
INSERT INTO bridge_links (engine_id, broker_id, is_active, capital_allocation_pct)
SELECT 'falcon', 'oanda_practice', true, 0.25
WHERE EXISTS (SELECT 1 FROM bridge_brokers WHERE broker_id = 'oanda_practice')
ON CONFLICT (engine_id, broker_id) DO UPDATE SET is_active = true, capital_allocation_pct = 0.25;

-- Verify:
-- SELECT engine_id, display_name, is_active, execution_threshold, max_daily_trades, max_hold_hours
-- FROM bridge_engines
-- ORDER BY engine_id;
