-- SignalForge Bridge — Seed bridge_engines and bridge_links (verified: Alpha 56, Charlie 48, Delta 58; all max_hold 4h)
--
-- REQUIRES: bridge_engines, bridge_brokers, bridge_links tables must exist (from 001a or 000_complete_bridge_schema_and_seed.sql).
-- RECOMMENDED: Run migrations/000_complete_bridge_schema_and_seed.sql instead — one file, no ordering assumptions.
-- If running files individually: run 001a, 001b, 001c, 001d, then 002, then this file.
-- Seed bridge_brokers first (required by bridge_links FK); order below respects FKs.

-- OANDA practice broker (token from env at runtime)
INSERT INTO bridge_brokers (broker_id, broker_type, display_name, api_token_encrypted, account_id, environment, api_base_url, is_active)
VALUES ('oanda_practice', 'oanda', 'OANDA Practice', 'ENV:OANDA_API_TOKEN', 'FROM_ENV', 'practice', 'https://api-fxpractice.oanda.com', true)
ON CONFLICT (broker_id) DO NOTHING;

-- Engines: Alpha 56/4h, Charlie 48/4h, Delta 58/4h (DO NOT use 56 for Charlie or Delta)
INSERT INTO bridge_engines (engine_id, engine_key, display_name, weight, is_active, max_daily_trades, priority, execution_threshold, max_hold_hours) VALUES
('alpha', 'sf_eng_' || gen_random_uuid(), 'Alpha Engine', 0.33, true, 8, 3, 56, 4),
('bravo', 'sf_eng_' || gen_random_uuid(), 'Bravo Engine', 0.00, false, 0, 0, 50, 12),
('charlie', 'sf_eng_' || gen_random_uuid(), 'Charlie Engine', 0.33, true, 10, 2, 48, 4),
('charlie2', 'sf_eng_' || gen_random_uuid(), 'Charlie2 Engine', 0.00, false, 0, 0, 48, 8),
('delta', 'sf_eng_' || gen_random_uuid(), 'Delta Engine', 0.34, true, 6, 1, 58, 4)
ON CONFLICT (engine_id) DO NOTHING;

-- Links: active engines only; capital 0.33, 0.33, 0.34
INSERT INTO bridge_links (engine_id, broker_id, is_active, capital_allocation_pct) VALUES
('alpha', 'oanda_practice', true, 0.330),
('charlie', 'oanda_practice', true, 0.330),
('delta', 'oanda_practice', true, 0.340)
ON CONFLICT (engine_id, broker_id) DO NOTHING;
