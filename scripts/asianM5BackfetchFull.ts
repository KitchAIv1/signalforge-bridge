/**
 * asianM5BackfetchFull.ts
 *
 * Backfills M5 Asian-session candles (00:00–08:00 UTC) from OANDA
 * for every trade_date in amd_state. Stores results in asian_m5_candles.
 *
 * Run: npx tsx scripts/asianM5BackfetchFull.ts
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  ASIAN_M5_PAIR,
  type AsianM5FetchStatus,
} from '../src/services/asianM5/asianM5Constants.js';
import {
  fetchAsianCandlesWithRetry,
  upsertAsianM5Row,
} from '../src/services/asianM5/asianM5CandleFetch.js';

dotenv.config();

const RATE_LIMIT_MS = 700;
const PROGRESS_EVERY = 10;
const DRY_RUN = process.env.DRY_RUN === 'true';
const RETRY_ERRORS = process.env.RETRY_ERRORS === 'true';

type AmdStateRow = { trade_date: string; amd_tag: string };

function buildSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('[AsianM5Backfetch] Missing SUPABASE_URL or service key');
  return createClient(url, key);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadAmdDates(supabase: ReturnType<typeof createClient>): Promise<AmdStateRow[]> {
  const { data, error } = await supabase
    .from('amd_state')
    .select('trade_date, amd_tag')
    .eq('pair', ASIAN_M5_PAIR)
    .order('trade_date', { ascending: true });
  if (error) throw new Error(`load amd_state: ${error.message}`);
  return (data ?? []) as AmdStateRow[];
}

async function loadExistingStatuses(
  supabase: ReturnType<typeof createClient>,
): Promise<Map<string, AsianM5FetchStatus>> {
  const { data, error } = await supabase
    .from('asian_m5_candles')
    .select('trade_date, fetch_status')
    .eq('pair', ASIAN_M5_PAIR);
  if (error) throw new Error(`load asian_m5_candles: ${error.message}`);
  const map = new Map<string, AsianM5FetchStatus>();
  for (const row of data ?? []) {
    map.set(row.trade_date as string, row.fetch_status as AsianM5FetchStatus);
  }
  return map;
}

function pickDatesToFetch(
  amdRows: AmdStateRow[],
  existing: Map<string, AsianM5FetchStatus>,
): AmdStateRow[] {
  return amdRows.filter((row) => {
    const status = existing.get(row.trade_date);
    if (status === 'success' || status === 'empty') return false;
    if (status === 'error' && !RETRY_ERRORS) return false;
    return true;
  });
}

async function main(): Promise<void> {
  console.log('=== ASIAN M5 BACKFETCH ===');
  console.log(`Pair:   ${ASIAN_M5_PAIR}`);
  console.log(`Window: 00:00 - 08:00 UTC`);
  console.log(`Dry run: ${DRY_RUN}`);
  if (!process.env.OANDA_API_TOKEN) throw new Error('[AsianM5Backfetch] OANDA_API_TOKEN not set');

  const supabase = buildSupabaseClient();
  const amdRows = await loadAmdDates(supabase);
  if (!amdRows.length) {
    console.log('No amd_state rows found.');
    return;
  }

  const existing = await loadExistingStatuses(supabase);
  const toFetch = pickDatesToFetch(amdRows, existing);
  console.log(`amd_state dates: ${amdRows.length}`);
  console.log(`To fetch:        ${toFetch.length}`);

  if (!toFetch.length) {
    console.log('All dates already fetched.');
    return;
  }

  if (DRY_RUN) {
    for (const row of toFetch.slice(0, 10)) {
      console.log(`  ${row.trade_date} (${row.amd_tag})`);
    }
    return;
  }

  let success = 0;
  let empty = 0;
  let errors = 0;

  for (let i = 0; i < toFetch.length; i += 1) {
    const row = toFetch[i]!;
    if (i % PROGRESS_EVERY === 0) {
      console.log(`[${i + 1}/${toFetch.length}] ${row.trade_date}`);
    }

    const fetchResult = await fetchAsianCandlesWithRetry(row.trade_date);
    try {
      await upsertAsianM5Row(supabase, row.trade_date, fetchResult);
      if (fetchResult.status === 'success') success += 1;
      else if (fetchResult.status === 'empty') empty += 1;
      else errors += 1;
    } catch (upsertErr) {
      console.error(`  DB write failed ${row.trade_date}:`, upsertErr);
      errors += 1;
    }

    if (i < toFetch.length - 1) await sleep(RATE_LIMIT_MS);
  }

  console.log('');
  console.log(`Success: ${success} | Empty: ${empty} | Error: ${errors}`);
}

main().catch((err) => {
  console.error('[AsianM5Backfetch] Fatal:', err);
  process.exit(1);
});
