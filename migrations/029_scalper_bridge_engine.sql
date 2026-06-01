-- Migration 029: Register scalper in bridge_engines for activity filter + overview cards.

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
  'scalper',
  'sf_eng_' || gen_random_uuid(),
  'AUDUSD Scalper',
  0.15,
  true,
  0,
  10,
  6,
  5,
  'AUDUSD price-ratchet scalper — AGREE gate, 10:32–16:00 UTC, max 3 ratchets/day'
) ON CONFLICT (engine_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  is_active = EXCLUDED.is_active,
  max_daily_trades = EXCLUDED.max_daily_trades,
  max_hold_hours = EXCLUDED.max_hold_hours,
  priority = EXCLUDED.priority,
  description = EXCLUDED.description,
  updated_at = NOW();
