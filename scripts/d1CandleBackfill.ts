/**
 * D1 Candle Backfill — fetch OANDA D1 bars for all amd_state trade dates,
 * compute full-day profile, upsert into d1_candles.
 *
 * Run: npx tsx scripts/d1CandleBackfill.ts
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OANDA_API_TOKEN
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchCompletedCandles } from '../src/connectors/oanda.js';
import { D1_DIRECTION_THRESHOLD_PIPS, D1_PAIR } from '../src/services/d1/d1Constants.js';
import { computeD1ProfileMetrics } from '../src/services/d1/d1ProfileMetrics.js';
import { buildD1Window } from '../src/services/d1/d1Window.js';
import {
  buildCandleFingerprint,
  isDuplicateCandleTime,
  isDuplicateOhlcWithinWindow,
  type StoredCandleFingerprint,
} from './d1CandleBackfill/duplicateCandleGuard.js';
import { isEligibleBackfillDate } from './d1CandleBackfill/isTradingDay.js';

const INSTRUMENT = D1_PAIR;
const DIRECTION_THRESHOLD_PIPS = D1_DIRECTION_THRESHOLD_PIPS;
const RATE_LIMIT_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('[D1Backfill] Missing SUPABASE_URL or service key');
  }
  return createClient(url, key);
}

async function loadAmdTradeDates(supabase: SupabaseClient): Promise<string[]> {
  const { data: amdRows, error } = await supabase
    .from('amd_state')
    .select('trade_date')
    .eq('pair', INSTRUMENT)
    .order('trade_date', { ascending: true });

  if (error) {
    throw new Error(`[D1Backfill] amd_state fetch failed: ${error.message}`);
  }

  return (amdRows ?? []).map((row) => row.trade_date as string);
}

async function loadExistingCandleIndex(supabase: SupabaseClient): Promise<{
  existingDates: Set<string>;
  candleTimeByTradeDate: Map<string, string>;
  fingerprints: StoredCandleFingerprint[];
}> {
  const { data: existing, error } = await supabase
    .from('d1_candles')
    .select('trade_date, candle_time, open_price, close_price')
    .eq('pair', INSTRUMENT)
    .order('trade_date', { ascending: true });

  if (error) {
    throw new Error(`[D1Backfill] d1_candles fetch failed: ${error.message}`);
  }

  const existingDates = new Set<string>();
  const candleTimeByTradeDate = new Map<string, string>();
  const fingerprints: StoredCandleFingerprint[] = [];

  for (const row of existing ?? []) {
    const tradeDate = row.trade_date as string;
    existingDates.add(tradeDate);
    candleTimeByTradeDate.set(row.candle_time as string, tradeDate);
    fingerprints.push(
      buildCandleFingerprint(
        tradeDate,
        row.candle_time as string,
        Number(row.open_price),
        Number(row.close_price),
      ),
    );
  }

  return { existingDates, candleTimeByTradeDate, fingerprints };
}

async function upsertD1Candle(
  supabase: SupabaseClient,
  tradeDate: string,
  candleTime: string,
  prices: { o: number; h: number; l: number; c: number },
): Promise<boolean> {
  const metrics = computeD1ProfileMetrics(
    {
      openPrice: prices.o,
      highPrice: prices.h,
      lowPrice: prices.l,
      closePrice: prices.c,
    },
    DIRECTION_THRESHOLD_PIPS,
  );

  const { error } = await supabase.from('d1_candles').upsert(
    {
      trade_date: tradeDate,
      pair: INSTRUMENT,
      open_price: prices.o,
      high_price: prices.h,
      low_price: prices.l,
      close_price: prices.c,
      net_pips: metrics.netPips,
      range_pips: metrics.rangePips,
      direction: metrics.direction,
      close_position_pct: metrics.closePositionPct,
      body_pct: metrics.bodyPct,
      upper_wick_pct: metrics.upperWickPct,
      lower_wick_pct: metrics.lowerWickPct,
      candle_time: candleTime,
    },
    { onConflict: 'trade_date,pair' },
  );

  if (error) {
    console.error(`[D1Backfill] DB error for ${tradeDate}:`, error.message);
    return false;
  }

  return true;
}

async function fetchAndStoreDate(
  supabase: SupabaseClient,
  tradeDate: string,
  candleTimeByTradeDate: Map<string, string>,
  priorFingerprint: StoredCandleFingerprint | undefined,
): Promise<
  | { outcome: 'success'; fingerprint: StoredCandleFingerprint }
  | { outcome: 'failed' | 'skipped' }
> {
  if (!isEligibleBackfillDate(tradeDate)) {
    console.log(`[D1Backfill] Weekend date ${tradeDate} — skipping`);
    return { outcome: 'skipped' };
  }

  const { fromISO, toISO } = buildD1Window(tradeDate);

  try {
    const candles = await fetchCompletedCandles(INSTRUMENT, 'D', fromISO, toISO);

    if (!candles || candles.length === 0) {
      console.log(`[D1Backfill] No candle for ${tradeDate} — skipping`);
      return { outcome: 'skipped' };
    }

    const candle = candles[0];
    const prices = {
      o: parseFloat(candle.mid.o),
      h: parseFloat(candle.mid.h),
      l: parseFloat(candle.mid.l),
      c: parseFloat(candle.mid.c),
    };

    if (isDuplicateCandleTime(candle.time, tradeDate, candleTimeByTradeDate)) {
      console.log(
        `[D1Backfill] Duplicate candle_time ${candle.time} for ${tradeDate} — skipping`,
      );
      return { outcome: 'skipped' };
    }

    if (isDuplicateOhlcWithinWindow(prices.o, prices.c, tradeDate, priorFingerprint)) {
      console.log(`[D1Backfill] Duplicate OHLC vs prior day for ${tradeDate} — skipping`);
      return { outcome: 'skipped' };
    }

    const stored = await upsertD1Candle(supabase, tradeDate, candle.time, prices);
    if (stored) {
      candleTimeByTradeDate.set(candle.time, tradeDate);
      return {
        outcome: 'success',
        fingerprint: buildCandleFingerprint(tradeDate, candle.time, prices.o, prices.c),
      };
    }
    return { outcome: 'failed' };
  } catch (err) {
    console.error(`[D1Backfill] Fetch error for ${tradeDate}:`, String(err));
    return { outcome: 'failed' };
  }
}

async function main(): Promise<void> {
  const supabase = buildSupabase();
  const amdDates = await loadAmdTradeDates(supabase);
  const { existingDates, candleTimeByTradeDate, fingerprints } =
    await loadExistingCandleIndex(supabase);
  const eligibleAmdDates = amdDates.filter(isEligibleBackfillDate);
  const toFetch = eligibleAmdDates.filter((tradeDate) => !existingDates.has(tradeDate));

  console.log(
    `[D1Backfill] ${toFetch.length} dates to fetch, ${existingDates.size} already stored`,
  );
  console.log(
    `[D1Backfill] amd_state eligible weekdays: ${eligibleAmdDates.length} / ${amdDates.length}`,
  );

  let success = 0;
  let failed = 0;
  let skipped = 0;
  const rollingFingerprints = [...fingerprints];

  for (const tradeDate of toFetch) {
    const priorFingerprint = rollingFingerprints[rollingFingerprints.length - 1];
    const result = await fetchAndStoreDate(
      supabase,
      tradeDate,
      candleTimeByTradeDate,
      priorFingerprint,
    );

    if (result.outcome === 'success') {
      success++;
      rollingFingerprints.push(result.fingerprint);
      if (success % 20 === 0) {
        console.log(`[D1Backfill] Progress: ${success} stored, ${failed} failed, ${skipped} skipped`);
      }
    } else if (result.outcome === 'skipped') {
      skipped++;
    } else {
      failed++;
    }

    await sleep(RATE_LIMIT_MS);
  }

  console.log(`[D1Backfill] Complete. Stored: ${success} Failed: ${failed} Skipped: ${skipped}`);

  const { count, error: countError } = await supabase
    .from('d1_candles')
    .select('*', { count: 'exact', head: true })
    .eq('pair', INSTRUMENT);

  if (countError) {
    console.error(`[D1Backfill] Count error: ${countError.message}`);
  } else {
    console.log(`[D1Backfill] Total in DB: ${count}`);
    console.log(`[D1Backfill] amd_state dates: ${amdDates.length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
