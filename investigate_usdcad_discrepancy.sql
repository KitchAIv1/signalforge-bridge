-- USDCAD Alpha vs Charlie Discrepancy Investigation
-- Run these in Supabase SQL Editor. Do NOT change any code.
--
-- CONTEXT:
--   Alpha dashboard: USDCAD SHORT WIN +13.8 pips (+$21.73), 25 min, 1:34 PM EDT
--   Charlie dashboard: USDCAD SHORT OPEN -6.6 pips (-$6.62), 4h 7m ago
--   Bridge: Alpha closed as LOSS, Charlie still open
--
-- HYPOTHESES TO TEST:
--   1. Engine dashboards use signal_outcomes / own price feed; Bridge uses OANDA.
--   2. OANDA triggers SL on ASK for SHORT, TP on BID; engines may use MID.
--   3. Spread/delay can cause engine to think TP hit while OANDA hit SL.
--   4. getClosedTradeDetails() uses OANDA transactions; Bridge result = OANDA P&L.
--------------------------------------------------------------------------------

-- 1. All USDCAD bridge_trade_log entries (both engines, last 48h)
SELECT
  id,
  signal_id,
  created_at,
  engine_id,
  pair,
  direction,
  decision,
  block_reason,
  oanda_trade_id,
  fill_price,
  exit_price,
  units,
  pnl_dollars,
  result,
  status,
  close_reason,
  closed_at,
  duration_minutes,
  stop_loss,
  take_profit,
  entry_price
FROM bridge_trade_log
WHERE pair = 'USD_CAD'
  AND created_at >= NOW() - INTERVAL '48 hours'
ORDER BY created_at ASC;

--------------------------------------------------------------------------------
-- 2. Corresponding signals for those trades (engine's original data)
SELECT
  s.id,
  s.created_at,
  s.engine_id,
  s.pair,
  s.direction,
  s.confluence_score,
  s.entry_zone_low,
  s.entry_zone_high,
  s.stop_loss,
  s.target_1,
  s.target_2,
  s.stop_loss_pips,
  s.target_1_pips
FROM signals s
WHERE (s.pair ILIKE 'USDCAD' OR s.pair ILIKE 'USD_CAD')
  AND s.created_at >= NOW() - INTERVAL '48 hours'
ORDER BY s.created_at ASC;

--------------------------------------------------------------------------------
-- 3. signal_outcomes for USDCAD (what engines write - engine dashboard source)
-- Note: signal_outcomes schema is engine-owned; adjust column names if different
SELECT *
FROM signal_outcomes
WHERE pair ILIKE '%USDCAD%' OR pair ILIKE '%USD_CAD%'
  AND created_at >= NOW() - INTERVAL '48 hours'
ORDER BY created_at ASC;

--------------------------------------------------------------------------------
-- 4. Cross-check: Bridge EXECUTED rows with their signal + outcome
SELECT
  b.id AS bridge_log_id,
  b.signal_id,
  b.engine_id,
  b.created_at AS bridge_created,
  b.decision,
  b.status,
  b.fill_price,
  b.exit_price,
  b.pnl_dollars,
  b.result,
  b.closed_at,
  b.duration_minutes,
  s.stop_loss,
  s.target_1,
  s.entry_zone_low,
  s.entry_zone_high
FROM bridge_trade_log b
JOIN signals s ON s.id = b.signal_id
WHERE b.pair = 'USD_CAD'
  AND b.decision = 'EXECUTED'
  AND b.created_at >= NOW() - INTERVAL '48 hours'
ORDER BY b.created_at ASC;

--------------------------------------------------------------------------------
-- INVESTIGATION RESULTS (2026-03-12)
--------------------------------------------------------------------------------
--
-- OANDA verification (npx tsx src/test/verifyUsdcadOanda.ts):
--   Trade 50: NOT open. exitPrice 1.35864, pnl +130.32  → matches Bridge (win)
--   Trade 68: NOT open. exitPrice 1.36307, pnl -512.43  → matches Bridge (loss)
--   Trade 72: OPEN in OANDA (USD_CAD -898539)          → matches Bridge (open)
--
-- KEY FINDING: Alpha (72) is still OPEN in both Bridge and OANDA.
-- Engine dashboard incorrectly showed Alpha as "closed WIN +13.8 pips".
-- Engine uses its own price feed; OANDA never hit TP (BID for SHORT). Spread/timing.
--
-- Query 3 (signal_outcomes): column "pair" may not exist; check engine schema.
