-- SignalForge Bridge — Migration verification
-- Run this in Supabase SQL Editor after 000_complete_bridge_schema_and_seed.sql
-- Each section can be run separately; the final query returns a single pass/fail summary.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. TABLES EXIST (9 bridge tables)
-- Expected: 9 rows, tablename like 'bridge_%'
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'bridge_%'
ORDER BY tablename;
-- Expected: bridge_alert_log, bridge_brokers, bridge_config, bridge_daily_snapshot,
--           bridge_engines, bridge_health_log, bridge_links, bridge_news_events, bridge_trade_log

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. bridge_engines — 5 rows, correct engine_id and thresholds
-- Expected: alpha(56,4), bravo(50,12), charlie(48,4), charlie2(48,8), delta(58,4)
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT engine_id, is_active, execution_threshold, max_hold_hours, weight, max_daily_trades, priority
FROM bridge_engines
ORDER BY engine_id;
-- Expected:
--   alpha   | t | 56 | 4  | 0.33 | 8  | 3
--   bravo   | f | 50 | 12 | 0.00 | 0  | 0
--   charlie | t | 48 | 4  | 0.33 | 10 | 2
--   charlie2| f | 48 | 8  | 0.00 | 0  | 0
--   delta   | t | 58 | 4  | 0.34 | 6  | 1

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. bridge_engines — required columns (including max_hold_hours)
-- Expected: 1 row with column_name list including max_hold_hours
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bridge_engines'
ORDER BY ordinal_position;
-- Expected columns include: engine_id, engine_key, display_name, weight, is_active,
--   max_daily_trades, trades_today, priority, execution_threshold, max_hold_hours

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. bridge_config — 25+ rows, config_value is JSONB
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT COUNT(*) AS config_row_count FROM bridge_config;
-- Expected: >= 25

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bridge_config' AND column_name = 'config_value';
-- Expected: config_value | jsonb

SELECT config_key, config_value
FROM bridge_config
ORDER BY config_key;
-- Expected: risk_per_trade_pct, bridge_active, kill_switch, charlie 48 / delta 58, etc.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. bridge_brokers — oanda_practice row
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT broker_id, broker_type, environment, api_base_url, is_active
FROM bridge_brokers;
-- Expected: oanda_practice | oanda | practice | https://api-fxpractice.oanda.com | t

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. bridge_links — 3 active links, capital 0.33, 0.33, 0.34
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT engine_id, broker_id, is_active, capital_allocation_pct
FROM bridge_links
ORDER BY engine_id;
-- Expected: alpha 0.33, charlie 0.33, delta 0.34 (all is_active = true, broker_id = oanda_practice)

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. bridge_trade_log — decision constraint and key columns
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bridge_trade_log'
  AND column_name IN ('signal_id', 'engine_id', 'decision', 'status', 'stop_loss');
-- Expected: decision and status with check constraints; stop_loss NOT NULL

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. RLS enabled on all bridge tables
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT tablename, rowsecurity
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public' AND t.tablename LIKE 'bridge_%'
ORDER BY tablename;
-- Expected: rowsecurity = true for each

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. SINGLE SUMMARY (run this for a compact pass/fail report)
-- All actual/expected cast to TEXT so UNION types match.
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT * FROM (
  SELECT 'bridge_tables_count' AS check_name,
         (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'bridge_%')::text AS actual,
         '9' AS expected,
         CASE WHEN (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'bridge_%') = 9 THEN 'PASS' ELSE 'FAIL' END AS status
  UNION ALL
  SELECT 'bridge_engines_rows',
         (SELECT COUNT(*) FROM bridge_engines)::text,
         '5',
         CASE WHEN (SELECT COUNT(*) FROM bridge_engines) = 5 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'bridge_engines_alpha_threshold',
         (SELECT execution_threshold::text FROM bridge_engines WHERE engine_id = 'alpha' LIMIT 1),
         '56',
         CASE WHEN (SELECT execution_threshold FROM bridge_engines WHERE engine_id = 'alpha' LIMIT 1) = 56 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'bridge_engines_charlie_threshold',
         (SELECT execution_threshold::text FROM bridge_engines WHERE engine_id = 'charlie' LIMIT 1),
         '48',
         CASE WHEN (SELECT execution_threshold FROM bridge_engines WHERE engine_id = 'charlie' LIMIT 1) = 48 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'bridge_engines_delta_threshold',
         (SELECT execution_threshold::text FROM bridge_engines WHERE engine_id = 'delta' LIMIT 1),
         '58',
         CASE WHEN (SELECT execution_threshold FROM bridge_engines WHERE engine_id = 'delta' LIMIT 1) = 58 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'bridge_engines_max_hold_hours',
         (SELECT string_agg(engine_id || '=' || max_hold_hours, ' ' ORDER BY engine_id) FROM bridge_engines),
         'alpha=4 charlie=4 delta=4',
         CASE WHEN (SELECT COUNT(*) FROM bridge_engines WHERE engine_id IN ('alpha','charlie','delta') AND max_hold_hours = 4) = 3 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'bridge_config_rows',
         (SELECT COUNT(*) FROM bridge_config)::text,
         '25',
         CASE WHEN (SELECT COUNT(*) FROM bridge_config) >= 25 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'bridge_config_value_type',
         (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bridge_config' AND column_name = 'config_value' LIMIT 1),
         'jsonb',
         CASE WHEN (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bridge_config' AND column_name = 'config_value' LIMIT 1) = 'jsonb' THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'bridge_brokers_oanda',
         (SELECT COUNT(*) FROM bridge_brokers WHERE broker_id = 'oanda_practice')::text,
         '1',
         CASE WHEN (SELECT COUNT(*) FROM bridge_brokers WHERE broker_id = 'oanda_practice') = 1 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'bridge_links_active_count',
         (SELECT COUNT(*) FROM bridge_links WHERE is_active = true)::text,
         '3',
         CASE WHEN (SELECT COUNT(*) FROM bridge_links WHERE is_active = true) = 3 THEN 'PASS' ELSE 'FAIL' END
  UNION ALL
  SELECT 'bridge_links_capital_sum',
         (SELECT ROUND(SUM(capital_allocation_pct)::numeric, 2)::text FROM bridge_links WHERE is_active = true),
         '1',
         CASE WHEN (SELECT ROUND(SUM(capital_allocation_pct)::numeric, 2) FROM bridge_links WHERE is_active = true) = 1 THEN 'PASS' ELSE 'FAIL' END
) AS v
ORDER BY check_name;
