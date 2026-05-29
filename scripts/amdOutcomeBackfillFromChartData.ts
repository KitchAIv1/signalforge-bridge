/**
 * Backfill amd_outcome_* from stored chart_data only (no OANDA).
 * Run: npm run amd-outcome-backfill
 */

import * as dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeDateFeatures } from '../src/services/amdDetector/amdFeatures.js';
import type { OhlcCandle } from '../src/services/amdDetector/amdFeatures.js';
import {
  chartEntryToOhlc,
  readOhlcFromChart,
} from './amdJudasWindow/chartOhlc.js';

dotenv.config();

const PAIR = 'AUD_USD';
const MIN_OUTCOME_UTC_HOUR = 13;
const MAX_OUTCOME_UTC_HOUR = 16;

type AmdChartRow = {
  trade_date: string;
  amd_outcome_tag: string | null;
  chart_data: Record<string, unknown> | null;
};

type BackfillCounters = {
  total: number;
  written: number;
  skippedInsufficientHours: number;
  skippedAlreadyPopulated: number;
  errors: number;
};

function buildSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('[OutcomeChartBackfill] Missing SUPABASE_URL or service key');
  }
  return createClient(url, key);
}

function chartUtcHourBounds(
  chartData: Record<string, unknown> | null
): { minHour: number | null; maxHour: number | null } {
  const entries = readOhlcFromChart(chartData);
  if (entries.length === 0) return { minHour: null, maxHour: null };
  const hours = entries.map((entry) => new Date(entry.time).getUTCHours());
  return { minHour: Math.min(...hours), maxHour: Math.max(...hours) };
}

function chartToOutcomeCandles(
  chartData: Record<string, unknown> | null
): OhlcCandle[] {
  return readOhlcFromChart(chartData)
    .filter((entry) => {
      const hourUtc = new Date(entry.time).getUTCHours();
      return hourUtc >= 0 && hourUtc <= MAX_OUTCOME_UTC_HOUR;
    })
    .sort(
      (left, right) =>
        new Date(left.time).getTime() - new Date(right.time).getTime()
    )
    .map(chartEntryToOhlc);
}

async function loadEligibleRows(
  supabaseDb: SupabaseClient
): Promise<AmdChartRow[]> {
  const { data, error } = await supabaseDb
    .from('amd_state')
    .select('trade_date, amd_outcome_tag, chart_data')
    .eq('pair', PAIR)
    .not('chart_data', 'is', null)
    .order('trade_date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AmdChartRow[];
}

async function writeOutcomeForRow(
  supabaseDb: SupabaseClient,
  tradeDate: string,
  outcomeTag: string,
  reversalOutcome: boolean | null,
  compressionOutcome: boolean
): Promise<void> {
  const { error } = await supabaseDb
    .from('amd_state')
    .update({
      amd_outcome_tag: outcomeTag,
      reversal_confirmed_outcome: reversalOutcome,
      compression_breakout_outcome: compressionOutcome,
      outcome_evaluated_at: new Date().toISOString(),
    })
    .eq('pair', PAIR)
    .eq('trade_date', tradeDate);
  if (error) throw new Error(error.message);
}

async function processRow(
  supabaseDb: SupabaseClient,
  row: AmdChartRow,
  counters: BackfillCounters
): Promise<void> {
  counters.total += 1;
  const { trade_date: tradeDate } = row;

  if (row.amd_outcome_tag != null) {
    counters.skippedAlreadyPopulated += 1;
    return;
  }

  const { minHour, maxHour } = chartUtcHourBounds(row.chart_data);
  if (maxHour == null || maxHour < MIN_OUTCOME_UTC_HOUR) {
    counters.skippedInsufficientHours += 1;
    console.log(
      `${tradeDate} → skipped: insufficient hours (max=${maxHour ?? 'none'})`
    );
    return;
  }

  try {
    const candles = chartToOutcomeCandles(row.chart_data);
    const outcomeFeatures = computeDateFeatures(candles, (badCandle, reason) => {
      console.warn(
        `[OutcomeChartBackfill] ${tradeDate} bad candle: ${reason}`,
        badCandle.time
      );
    });

    await writeOutcomeForRow(
      supabaseDb,
      tradeDate,
      outcomeFeatures.amd_tag,
      outcomeFeatures.reversal_confirmed,
      outcomeFeatures.compression_breakout
    );
    counters.written += 1;
    console.log(
      `${tradeDate} → outcome: ${outcomeFeatures.amd_tag} | ` +
        `reversal: ${outcomeFeatures.reversal_confirmed ?? 'null'} | ` +
        `hours: ${minHour}-${maxHour}`
    );
  } catch (rowErr: unknown) {
    counters.errors += 1;
    const message = rowErr instanceof Error ? rowErr.message : String(rowErr);
    console.log(`${tradeDate} → error: ${message}`);
  }
}

function printSummary(counters: BackfillCounters): void {
  console.log('\n=== Outcome chart backfill summary ===');
  console.log(`Total rows: ${counters.total}`);
  console.log(`Written: ${counters.written}`);
  console.log(`Skipped (insufficient hours): ${counters.skippedInsufficientHours}`);
  console.log(`Skipped (already populated): ${counters.skippedAlreadyPopulated}`);
  console.log(`Errors: ${counters.errors}`);
}

async function printValidationQueries(supabaseDb: SupabaseClient): Promise<void> {
  const { data: tagGroups, error: tagErr } = await supabaseDb
    .from('amd_state')
    .select('amd_outcome_tag, amd_tag, judas_pips, asian_range_pips')
    .eq('pair', PAIR)
    .not('amd_outcome_tag', 'is', null);
  if (tagErr) throw new Error(tagErr.message);

  const grouped = new Map<
    string,
    { n: number; failedJudas8: number }
  >();
  for (const row of tagGroups ?? []) {
    const outcomeTag = String(row.amd_outcome_tag);
    const bucket = grouped.get(outcomeTag) ?? { n: 0, failedJudas8: 0 };
    bucket.n += 1;
    const isFailedJudas8 =
      row.amd_tag === 'AMD_FAILED' &&
      (row.judas_pips ?? 0) >= 8 &&
      (row.asian_range_pips ?? 999) < 35;
    if (isFailedJudas8) bucket.failedJudas8 += 1;
    grouped.set(outcomeTag, bucket);
  }

  console.log('\n=== Validation: outcome tag distribution ===');
  const sorted = [...grouped.entries()].sort((a, b) => b[1].n - a[1].n);
  for (const [tag, stats] of sorted) {
    console.log(
      `${tag}: n=${stats.n}, failed_judas8_count=${stats.failedJudas8}`
    );
  }

  const { data: failedRows, error: failedErr } = await supabaseDb
    .from('amd_state')
    .select(
      'trade_date, amd_tag, amd_outcome_tag, judas_pips, asian_range_pips, reversal_confirmed_outcome'
    )
    .eq('pair', PAIR)
    .eq('amd_tag', 'AMD_FAILED')
    .gte('judas_pips', 8)
    .lt('asian_range_pips', 35)
    .not('amd_outcome_tag', 'is', null)
    .order('trade_date', { ascending: true });
  if (failedErr) throw new Error(failedErr.message);

  console.log('\n=== Validation: AMD_FAILED + judas≥8 + asian<35 with outcome ===');
  for (const row of failedRows ?? []) {
    console.log(
      `${row.trade_date} | live=${row.amd_tag} | outcome=${row.amd_outcome_tag} | ` +
        `judas=${row.judas_pips} | asian=${row.asian_range_pips} | ` +
        `rev_outcome=${row.reversal_confirmed_outcome}`
    );
  }

  const textbookCount = (failedRows ?? []).filter(
    (row) => row.amd_outcome_tag === 'AMD_TEXTBOOK'
  ).length;
  const failedCount = (failedRows ?? []).length;
  const pct =
    failedCount === 0
      ? 'n/a'
      : `${Math.round((1000 * textbookCount) / failedCount) / 10}%`;
  console.log(
    `\nProxy precision (live FAILED+judas8+tight → outcome TEXTBOOK): ` +
      `${textbookCount}/${failedCount} = ${pct}`
  );
}

async function main(): Promise<void> {
  const supabaseDb = buildSupabase();
  const rows = await loadEligibleRows(supabaseDb);
  const counters: BackfillCounters = {
    total: 0,
    written: 0,
    skippedInsufficientHours: 0,
    skippedAlreadyPopulated: 0,
    errors: 0,
  };

  console.log(`[OutcomeChartBackfill] Loaded ${rows.length} rows with chart_data\n`);

  for (const row of rows) {
    await processRow(supabaseDb, row, counters);
  }

  printSummary(counters);
  await printValidationQueries(supabaseDb);
}

main().catch((fatalErr) => {
  console.error('[OutcomeChartBackfill] Fatal:', fatalErr);
  process.exitCode = 1;
});
