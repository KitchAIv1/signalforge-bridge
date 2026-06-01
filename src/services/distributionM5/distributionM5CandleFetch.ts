/** Fetch and upsert distribution session M5 candles to amd_m5_distribution_candles. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCompletedCandles } from '../../connectors/oanda.js';
import { getSupabaseClient } from '../../connectors/supabase.js';
import {
  DISTRIBUTION_END_UTC,
  DISTRIBUTION_M5_PAIR,
  DISTRIBUTION_M5_TABLE,
  DISTRIBUTION_START_UTC,
  type DistributionM5FetchStatus,
  type DistributionM5StoredCandle,
} from './distributionM5Constants.js';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1500;

export function buildDistributionFetchWindow(tradeDate: string): { fromISO: string; toISO: string } {
  return {
    fromISO: `${tradeDate}T${DISTRIBUTION_START_UTC}`,
    toISO: `${tradeDate}T${DISTRIBUTION_END_UTC}`,
  };
}

function mapOandaCandles(
  raw: Awaited<ReturnType<typeof fetchCompletedCandles>>,
): DistributionM5StoredCandle[] {
  return raw.map((candle) => ({
    time: candle.time,
    o: candle.mid.o,
    h: candle.mid.h,
    l: candle.mid.l,
    c: candle.mid.c,
  }));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchDistributionCandlesWithRetry(tradeDate: string): Promise<{
  candles: DistributionM5StoredCandle[];
  status: DistributionM5FetchStatus;
  errorMessage: string | null;
}> {
  const { fromISO, toISO } = buildDistributionFetchWindow(tradeDate);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const raw = await fetchCompletedCandles(DISTRIBUTION_M5_PAIR, 'M5', fromISO, toISO);
      const candles = mapOandaCandles(raw);
      if (candles.length === 0) {
        return { candles: [], status: 'empty', errorMessage: null };
      }
      return { candles, status: 'success', errorMessage: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt === MAX_RETRIES) {
        return {
          candles: [],
          status: 'error',
          errorMessage: `After ${MAX_RETRIES} attempts: ${message}`,
        };
      }
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
    }
  }

  return { candles: [], status: 'error', errorMessage: 'Unexpected retry loop exit' };
}

export async function upsertDistributionM5Row(
  supabase: SupabaseClient,
  tradeDate: string,
  fetchResult: Awaited<ReturnType<typeof fetchDistributionCandlesWithRetry>>,
): Promise<void> {
  const { error } = await supabase.from(DISTRIBUTION_M5_TABLE).upsert(
    {
      trade_date: tradeDate,
      pair: DISTRIBUTION_M5_PAIR,
      candles: fetchResult.candles,
      candle_count: fetchResult.candles.length,
      fetch_status: fetchResult.status,
      error_message: fetchResult.errorMessage,
      fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'trade_date,pair' },
  );
  if (error) throw new Error(`upsertDistributionM5Row ${tradeDate}: ${error.message}`);
}

async function fetchAndStoreDistributionCandlesForDate(
  tradeDate: string,
  supabase?: SupabaseClient,
): Promise<Awaited<ReturnType<typeof fetchDistributionCandlesWithRetry>>> {
  const client = supabase ?? getSupabaseClient();
  const fetchResult = await fetchDistributionCandlesWithRetry(tradeDate);
  await upsertDistributionM5Row(client, tradeDate, fetchResult);
  return fetchResult;
}

export async function fetchTodayDistributionCandles(): Promise<void> {
  const tradeDate = new Date().toISOString().slice(0, 10);
  const fetchResult = await fetchAndStoreDistributionCandlesForDate(tradeDate);
  console.log(
    `[DistributionM5] Fetched ${fetchResult.candles.length} candles for ${tradeDate} (status=${fetchResult.status})`,
  );
}
