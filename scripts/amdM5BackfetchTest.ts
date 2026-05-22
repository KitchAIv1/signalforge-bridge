/**
 * amdM5BackfetchTest.ts
 *
 * Single-date validation test before running the full M5 backfetch.
 * Tests that OANDA practice account has M5 history for distribution
 * window (10:00-16:00 UTC) on a known AMD backtest date.
 *
 * Usage:
 *   npx ts-node scripts/amdM5BackfetchTest.ts
 *
 * Requires: OANDA_API_TOKEN, OANDA_ENVIRONMENT
 *
 * Expected: ~72 M5 candles returned (6h × 12 bars/h).
 * Pass criteria: candle_count >= 50 (allows for partial days/holidays).
 */

import * as dotenv from 'dotenv';
import { fetchCompletedCandles } from '../src/connectors/oanda.js';

dotenv.config();

// Test against a known AMD_TEXTBOOK day from the backtest
// (confirmed to have amd_state data)
const TEST_DATE = '2025-09-11'; // AMD_TEXTBOOK, ALIGNED, Sep 11 2025

// Distribution window: 10:00 UTC open through 15:55 UTC last M5 close
const DISTRIBUTION_FROM = `${TEST_DATE}T10:00:00.000000000Z`;
const DISTRIBUTION_TO   = `${TEST_DATE}T16:00:00.000000000Z`;

const PAIR = 'AUD_USD';
const PASS_THRESHOLD = 50;

async function runTest(): Promise<void> {
  console.log('=== AMD M5 BACKFETCH TEST ===');
  console.log(`Date:      ${TEST_DATE}`);
  console.log(`Pair:      ${PAIR}`);
  console.log(`Window:    ${DISTRIBUTION_FROM} → ${DISTRIBUTION_TO}`);
  console.log(`OANDA env: ${process.env.OANDA_ENVIRONMENT ?? 'practice'}`);
  console.log('');

  if (!process.env.OANDA_API_TOKEN) {
    throw new Error('[Test] OANDA_API_TOKEN not set');
  }

  console.log('[Test] Fetching M5 candles from OANDA...');
  const startMs = Date.now();

  let candles: Awaited<ReturnType<typeof fetchCompletedCandles>>;
  try {
    candles = await fetchCompletedCandles(
      PAIR,
      'M5',
      DISTRIBUTION_FROM,
      DISTRIBUTION_TO,
    );
  } catch (err) {
    console.error('[Test] OANDA fetch threw an error:');
    console.error(err);
    console.log('');
    console.log('❌ FAIL — Cannot proceed with full backfetch.');
    process.exit(1);
  }

  const elapsed = Date.now() - startMs;
  console.log(`[Test] Fetch completed in ${elapsed}ms`);
  console.log('');

  // --- Results ---
  console.log(`Candles returned: ${candles.length}`);
  console.log(`Expected:         ~72 (6h × 12 M5 bars)`);
  console.log('');

  if (candles.length === 0) {
    console.log('❌ FAIL — OANDA returned 0 candles.');
    console.log('   Practice account may not have M5 history for this date.');
    console.log('   Check OANDA_ENVIRONMENT and account history limits.');
    process.exit(1);
  }

  // Print first candle
  const first = candles[0];
  console.log('First candle:');
  console.log(`  time: ${first.time}`);
  console.log(`  open: ${first.mid.o}`);
  console.log(`  high: ${first.mid.h}`);
  console.log(`  low:  ${first.mid.l}`);
  console.log(`  close:${first.mid.c}`);
  console.log('');

  // Print last candle
  const last = candles[candles.length - 1];
  console.log('Last candle:');
  console.log(`  time: ${last.time}`);
  console.log(`  open: ${last.mid.o}`);
  console.log(`  high: ${last.mid.h}`);
  console.log(`  low:  ${last.mid.l}`);
  console.log(`  close:${last.mid.c}`);
  console.log('');

  // Validate time range
  const firstHour = new Date(first.time).getUTCHours();
  const lastHour  = new Date(last.time).getUTCHours();
  console.log(`First candle UTC hour: ${firstHour} (expected 10)`);
  console.log(`Last candle UTC hour:  ${lastHour}  (expected 15)`);
  console.log('');

  // Validate field completeness
  const incomplete = candles.filter(
    c => !c.mid.o || !c.mid.h || !c.mid.l || !c.mid.c
  );
  if (incomplete.length > 0) {
    console.log(`⚠️  WARNING: ${incomplete.length} candles have null OHLC fields`);
  } else {
    console.log('✅ All candles have complete OHLC fields');
  }
  console.log('');

  // Pass/fail
  if (candles.length >= PASS_THRESHOLD) {
    console.log(`✅ PASS — ${candles.length} candles returned (>= ${PASS_THRESHOLD} threshold)`);
    console.log('   Safe to proceed with amdM5BackfetchFull.ts');
  } else {
    console.log(`⚠️  PARTIAL — Only ${candles.length} candles returned.`);
    console.log('   This may be acceptable for a partial trading day.');
    console.log('   Review candle times above before proceeding.');
  }

  console.log('');
  console.log('=== TEST COMPLETE ===');
}

runTest().catch(err => {
  console.error('[Test] Fatal error:', err);
  process.exit(1);
});
