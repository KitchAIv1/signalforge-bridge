/** Fetch and upsert Asian session M5 candles to asian_m5_candles. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCompletedCandles } from '../../connectors/oanda.js';
import { getSupabaseClient } from '../../connectors/supabase.js';
import {
  ASIAN_END_UTC,
  ASIAN_M5_PAIR,
  ASIAN_M5_TABLE,
  ASIAN_START_UTC,
  type AsianM5FetchStatus,
  type AsianM5StoredCandle,
} from './asianM5Constants.js';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1500;

export function buildAsianFetchWindow(tradeDate: string): { fromISO: string; toISO: string } {
  return {
    fromISO: `${tradeDate}T${ASIAN_START_UTC}`,
    toISO: `${tradeDate}T${ASIAN_END_UTC}`,
  };
}

function mapOandaCandles(
  raw: Awaited<ReturnType<typeof fetchCompletedCandles>>,
): AsianM5StoredCandle[] {
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

export async function fetchAsianCandlesWithRetry(tradeDate: string): Promise<{
  candles: AsianM5StoredCandle[];
  status: AsianM5FetchStatus;
  errorMessage: string | null;
}> {
  const { fromISO, toISO } = buildAsianFetchWindow(tradeDate);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const raw = await fetchCompletedCandles(ASIAN_M5_PAIR, 'M5', fromISO, toISO);
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

export async function upsertAsianM5Row(
  supabase: SupabaseClient,
  tradeDate: string,
  fetchResult: Awaited<ReturnType<typeof fetchAsianCandlesWithRetry>>,
): Promise<void> {
  const { error } = await supabase.from(ASIAN_M5_TABLE).upsert(
    {
      trade_date: tradeDate,
      pair: ASIAN_M5_PAIR,
      candles: fetchResult.candles,
      candle_count: fetchResult.candles.length,
      fetch_status: fetchResult.status,
      error_message: fetchResult.errorMessage,
      fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'trade_date,pair' },
  );
  if (error) throw new Error(`upsertAsianM5Row ${tradeDate}: ${error.message}`);
}

export async function fetchAndStoreAsianCandlesForDate(
  tradeDate: string,
  supabase?: SupabaseClient,
): Promise<Awaited<ReturnType<typeof fetchAsianCandlesWithRetry>>> {
  const client = supabase ?? getSupabaseClient();
  const fetchResult = await fetchAsianCandlesWithRetry(tradeDate);
  await upsertAsianM5Row(client, tradeDate, fetchResult);
  return fetchResult;
}

export async function fetchTodayAsianCandles(): Promise<void> {
  const tradeDate = new Date().toISOString().slice(0, 10);
  const fetchResult = await fetchAndStoreAsianCandlesForDate(tradeDate);
  console.log(
    `[AsianM5] Stored ${tradeDate}: status=${fetchResult.status} candles=${fetchResult.candles.length}`,
  );
}
