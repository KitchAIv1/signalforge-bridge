/**
 * amdM5BackfetchFull.ts
 *
 * Backfetches M5 distribution-window candles (10:00-16:00 UTC) from OANDA
 * for every trade_date in amd_state. Stores results in
 * amd_m5_distribution_candles table.
 *
 * Safety features:
 *   - Idempotent: skips dates already fetched with status='success'
 *   - Rate limiting: 700ms between OANDA requests (safe for practice API)
 *   - Retry logic: 3 attempts per date with exponential backoff
 *   - Empty handling: OANDA returns 0 candles → status='empty' (holidays/gaps)
 *   - Error handling: fetch failure after retries → status='error' with message
 *   - Progress reporting: every 10 dates
 *   - Dry run mode: set DRY_RUN=true to preview without writing to DB
 *   - Resume: re-run safely — only fetches pending/error dates
 *
 * Run test first:
 *   npx ts-node scripts/amdM5BackfetchTest.ts
 *
 * Then run full fetch:
 *   npx ts-node scripts/amdM5BackfetchFull.ts
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   OANDA_API_TOKEN, OANDA_ENVIRONMENT
 *
 * Optional:
 *   DRY_RUN=true     — preview only, no DB writes
 *   RETRY_ERRORS=true — also retry dates with status='error'
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fetchCompletedCandles } from '../src/connectors/oanda.js';

dotenv.config();

// ─── Config ────────────────────────────────────────────────────────────────

const PAIR = 'AUD_USD';

// Distribution window: 10:00 UTC open → 16:00 UTC (covers 72 M5 bars max)
const DIST_START_UTC = '10:00:00.000000000Z';
const DIST_END_UTC   = '16:00:00.000000000Z';

// Rate limiting — ms between OANDA requests (700ms = ~1.4 req/sec, well under limits)
const RATE_LIMIT_MS = 700;

// Retry config
const MAX_RETRIES    = 3;
const RETRY_BASE_MS  = 1500; // base backoff: 1.5s, 3s, 6s

// Progress reporting interval
const PROGRESS_EVERY = 10;

// Feature flags
const DRY_RUN     = process.env.DRY_RUN === 'true';
const RETRY_ERRORS = process.env.RETRY_ERRORS === 'true';

// ─── Types ─────────────────────────────────────────────────────────────────

type FetchStatus = 'success' | 'empty' | 'error' | 'pending';

type AmdStateRow = {
  trade_date: string;
  amd_tag: string;
};

type M5CandleRow = {
  trade_date: string;
  pair: string;
  candles: Array<{ time: string; o: string; h: string; l: string; c: string }>;
  candle_count: number;
  fetch_status: FetchStatus;
  error_message: string | null;
  fetched_at: string;
};

type RunSummary = {
  total_dates: number;
  skipped_already_done: number;
  fetched_success: number;
  fetched_empty: number;
  fetched_error: number;
  dry_run: boolean;
};

// ─── Supabase ──────────────────────────────────────────────────────────────

function buildSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[M5Backfetch] Missing SUPABASE_URL or service key env var');
  }
  return createClient(supabaseUrl, supabaseKey);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildFetchWindow(tradeDate: string): { fromISO: string; toISO: string } {
  return {
    fromISO: `${tradeDate}T${DIST_START_UTC}`,
    toISO:   `${tradeDate}T${DIST_END_UTC}`,
  };
}

function formatProgress(current: number, total: number): string {
  const pct = ((current / total) * 100).toFixed(1);
  return `[${current}/${total} ${pct}%]`;
}

// ─── OANDA fetch with retry ────────────────────────────────────────────────

async function fetchWithRetry(
  tradeDate: string,
): Promise<{
  candles: M5CandleRow['candles'];
  status: FetchStatus;
  errorMessage: string | null;
}> {
  const { fromISO, toISO } = buildFetchWindow(tradeDate);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await fetchCompletedCandles(PAIR, 'M5', fromISO, toISO);

      // Map OhlcCandle to flat storage format
      const candles = raw.map(c => ({
        time: c.time,
        o:    c.mid.o,
        h:    c.mid.h,
        l:    c.mid.l,
        c:    c.mid.c,
      }));

      if (candles.length === 0) {
        return { candles: [], status: 'empty', errorMessage: null };
      }

      return { candles, status: 'success', errorMessage: null };

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (attempt === MAX_RETRIES) {
        // All retries exhausted
        return {
          candles: [],
          status: 'error',
          errorMessage: `After ${MAX_RETRIES} attempts: ${message}`,
        };
      }

      // Exponential backoff before retry
      const backoffMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.log(
        `  [Retry ${attempt}/${MAX_RETRIES}] ${tradeDate} failed: ${message}. ` +
        `Waiting ${backoffMs}ms...`
      );
      await sleep(backoffMs);
    }
  }

  // Unreachable but TypeScript requires it
  return {
    candles: [],
    status: 'error',
    errorMessage: 'Unexpected retry loop exit',
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== AMD M5 DISTRIBUTION BACKFETCH ===');
  console.log(`Pair:        ${PAIR}`);
  console.log(`Window:      ${DIST_START_UTC.slice(0, 5)} - ${DIST_END_UTC.slice(0, 5)} UTC`);
  console.log(`Rate limit:  ${RATE_LIMIT_MS}ms between requests`);
  console.log(`Max retries: ${MAX_RETRIES}`);
  console.log(`Dry run:     ${DRY_RUN}`);
  console.log(`Retry errors:${RETRY_ERRORS}`);
  console.log('');

  // Validate env
  if (!process.env.OANDA_API_TOKEN) {
    throw new Error('[M5Backfetch] OANDA_API_TOKEN not set');
  }

  const supabase = buildSupabaseClient();

  // ── Step 1: Load all amd_state dates ──────────────────────────────────────
  console.log('[Step 1] Loading amd_state dates from Supabase...');

  const { data: amdRows, error: amdErr } = await supabase
    .from('amd_state')
    .select('trade_date, amd_tag')
    .eq('pair', PAIR)
    .order('trade_date', { ascending: true });

  if (amdErr) {
    throw new Error(`[M5Backfetch] Failed to load amd_state: ${amdErr.message}`);
  }

  if (!amdRows || amdRows.length === 0) {
    console.log('[M5Backfetch] No amd_state rows found. Run amdHistoricalBacktest.ts first.');
    return;
  }

  console.log(`[Step 1] Found ${amdRows.length} dates in amd_state`);
  console.log('');

  // ── Step 2: Load already-fetched dates ────────────────────────────────────
  console.log('[Step 2] Loading already-fetched dates from amd_m5_distribution_candles...');

  const fetchedStatusQuery = supabase
    .from('amd_m5_distribution_candles')
    .select('trade_date, fetch_status')
    .eq('pair', PAIR);

  const { data: fetchedRows, error: fetchedErr } = await fetchedStatusQuery;

  if (fetchedErr) {
    throw new Error(
      `[M5Backfetch] Failed to load existing fetch records: ${fetchedErr.message}`
    );
  }

  // Build set of dates to skip
  const skipDates = new Set<string>();
  const errorDates = new Set<string>();

  for (const row of (fetchedRows ?? [])) {
    if (row.fetch_status === 'success' || row.fetch_status === 'empty') {
      skipDates.add(row.trade_date as string);
    } else if (row.fetch_status === 'error') {
      errorDates.add(row.trade_date as string);
    }
  }

  // Dates to process
  const toFetch = (amdRows as AmdStateRow[]).filter(row => {
    const date = row.trade_date;
    if (skipDates.has(date)) return false;
    if (errorDates.has(date) && !RETRY_ERRORS) return false;
    return true;
  });

  const alreadyDone = amdRows.length - toFetch.length;

  console.log(`[Step 2] Already done (success/empty): ${skipDates.size}`);
  console.log(`[Step 2] Error dates:                  ${errorDates.size}${RETRY_ERRORS ? ' (will retry)' : ' (skipping)'}`);
  console.log(`[Step 2] To fetch:                     ${toFetch.length}`);
  console.log('');

  if (toFetch.length === 0) {
    console.log('✅ All dates already fetched. Nothing to do.');
    console.log('   Run with RETRY_ERRORS=true to re-attempt failed dates.');
    return;
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would fetch ${toFetch.length} dates:`);
    for (const row of toFetch.slice(0, 10)) {
      console.log(`  ${row.trade_date} (${row.amd_tag})`);
    }
    if (toFetch.length > 10) {
      console.log(`  ... and ${toFetch.length - 10} more`);
    }
    const estimatedMinutes = ((toFetch.length * RATE_LIMIT_MS) / 60000).toFixed(1);
    console.log(`[DRY RUN] Estimated time: ~${estimatedMinutes} minutes`);
    return;
  }

  // ── Step 3: Fetch and store ────────────────────────────────────────────────
  const estimatedMinutes = ((toFetch.length * RATE_LIMIT_MS) / 60000).toFixed(1);
  console.log(`[Step 3] Starting fetch (~${estimatedMinutes} min estimated)...`);
  console.log('');

  const summary: RunSummary = {
    total_dates:           toFetch.length,
    skipped_already_done:  alreadyDone,
    fetched_success:       0,
    fetched_empty:         0,
    fetched_error:         0,
    dry_run:               false,
  };

  for (let i = 0; i < toFetch.length; i++) {
    const row = toFetch[i];
    const tradeDate = row.trade_date;

    // Progress reporting
    if (i % PROGRESS_EVERY === 0 || i === 0) {
      console.log(`${formatProgress(i + 1, toFetch.length)} Processing ${tradeDate}...`);
    }

    // Fetch from OANDA
    const { candles, status, errorMessage } = await fetchWithRetry(tradeDate);

    // Build DB row
    const dbRow: M5CandleRow = {
      trade_date:    tradeDate,
      pair:          PAIR,
      candles,
      candle_count:  candles.length,
      fetch_status:  status,
      error_message: errorMessage,
      fetched_at:    new Date().toISOString(),
    };

    // Upsert to Supabase
    const { error: upsertErr } = await supabase
      .from('amd_m5_distribution_candles')
      .upsert(dbRow, { onConflict: 'trade_date,pair' });

    if (upsertErr) {
      // DB write failure — log but do not abort the whole run
      console.error(
        `  ⚠️  DB write failed for ${tradeDate}: ${upsertErr.message}`
      );
      summary.fetched_error++;
    } else {
      // Track summary
      if (status === 'success') {
        summary.fetched_success++;
        // Detailed log for milestones
        if (i % PROGRESS_EVERY === 0) {
          console.log(`  ✅ ${tradeDate}: ${candles.length} M5 candles (${row.amd_tag})`);
        }
      } else if (status === 'empty') {
        summary.fetched_empty++;
        console.log(`  ⚪ ${tradeDate}: 0 candles — holiday/gap (${row.amd_tag})`);
      } else {
        summary.fetched_error++;
        console.log(`  ❌ ${tradeDate}: ERROR — ${errorMessage}`);
      }
    }

    // Rate limit — wait between requests (skip on last item)
    if (i < toFetch.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  // ── Step 4: Final summary ─────────────────────────────────────────────────
  console.log('');
  console.log('=== BACKFETCH COMPLETE ===');
  console.log(`Total amd_state dates:  ${amdRows.length}`);
  console.log(`Skipped (already done): ${summary.skipped_already_done}`);
  console.log(`Processed this run:     ${summary.total_dates}`);
  console.log(`  ✅ Success:           ${summary.fetched_success}`);
  console.log(`  ⚪ Empty (holiday):   ${summary.fetched_empty}`);
  console.log(`  ❌ Error:             ${summary.fetched_error}`);
  console.log('');

  if (summary.fetched_error > 0) {
    console.log(`⚠️  ${summary.fetched_error} dates failed. Re-run with RETRY_ERRORS=true to retry.`);
  }

  if (summary.fetched_success > 0) {
    console.log('');
    console.log('Next steps:');
    console.log('  1. Run validation query:');
    console.log('     SELECT fetch_status, COUNT(*) FROM amd_m5_distribution_candles GROUP BY fetch_status;');
    console.log('  2. Spot check a TEXTBOOK day:');
    console.log('     SELECT trade_date, candle_count, fetch_status FROM amd_m5_distribution_candles WHERE trade_date = \'2025-09-11\';');
    console.log('  3. Proceed to amdM5ExitStrategySimulation.ts once all dates show success/empty.');
  }
}

main().catch(err => {
  console.error('[M5Backfetch] Fatal error:', err);
  process.exit(1);
});
