/**
 * Asian max swing analysis — per-candle H-L range in hours 00–07 UTC vs distribution follow-through.
 * READ-ONLY research — amd_state chart_data.ohlc + window outcome fields.
 *
 * Run: npx tsx scripts/amdAsianSwingAnalysis.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';
const OUTPUT_DIR = path.join(process.cwd(), 'scripts/output');
const TODAY_TRADE_DATE = '2026-06-05';

export type SwingBucket = 'LOW' | 'MEDIUM' | 'HIGH';
export type QualBucket = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ChartOhlcBar {
  time: string;
  h: string;
  l: string;
}

export interface AmdAsianSourceRow {
  trade_date: string;
  amd_outcome_tag: string;
  window_direction_confirmed: boolean | null;
  window_pip_move: number | null;
  accumulation_quality_score: number | null;
  asian_range_pips: number | null;
  asian_net_pips: number | null;
  judas_timing: string | null;
  daily_bias_alignment: string | null;
  chart_data: Record<string, unknown> | null;
}

export interface AsianSwingRow {
  trade_date: string;
  outcome_tag: string;
  asian_max_swing_pips: number | null;
  swing_bucket: SwingBucket | null;
  accumulation_quality_score: number | null;
  qual_bucket: QualBucket | null;
  asian_range_pips: number | null;
  asian_net_pips: number | null;
  judas_timing: string | null;
  daily_bias_alignment: string | null;
  window_direction_confirmed: boolean | null;
  window_pip_move: number | null;
}

export interface SwingOutcomeAggregate {
  swing_bucket: SwingBucket;
  outcome_tag: string;
  n: number;
  direction_confirmed_rate: number | null;
  avg_window_pip_move_abs: number | null;
  pct_of_total: number;
}

export interface SwingQualAggregate {
  swing_bucket: SwingBucket;
  qual_bucket: QualBucket;
  n: number;
  direction_confirmed_rate: number | null;
  avg_window_pip_move_abs: number | null;
}

const AMD_STATE_SELECT =
  'trade_date, amd_outcome_tag, window_direction_confirmed, window_pip_move, ' +
  'accumulation_quality_score, asian_range_pips, asian_net_pips, judas_timing, ' +
  'daily_bias_alignment, chart_data';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (name === 'SUPABASE_SERVICE_ROLE_KEY' && process.env.SUPABASE_SERVICE_KEY) {
    return process.env.SUPABASE_SERVICE_KEY;
  }
  throw new Error(`Missing env: ${name}`);
}

function parseChartOhlc(chartData: Record<string, unknown> | null): ChartOhlcBar[] {
  const raw = chartData?.ohlc;
  if (!Array.isArray(raw)) return [];
  const bars: ChartOhlcBar[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.time !== 'string') continue;
    const h = row.h != null ? String(row.h) : '';
    const l = row.l != null ? String(row.l) : '';
    if (!h || !l) continue;
    bars.push({ time: row.time, h, l });
  }
  return bars;
}

function asianSessionBars(bars: ChartOhlcBar[]): ChartOhlcBar[] {
  return bars.filter((bar) => {
    const utcHour = new Date(bar.time).getUTCHours();
    return utcHour >= 0 && utcHour <= 7;
  });
}

export function deriveAsianMaxSwingPips(chartData: unknown): number | null {
  const ohlc = parseChartOhlc(chartData as Record<string, unknown> | null);
  const asianBars = asianSessionBars(ohlc);
  if (asianBars.length < 4) return null;

  const swings = asianBars.map((bar) =>
    Math.round((parseFloat(bar.h) - parseFloat(bar.l)) * 10000 * 10) / 10,
  );
  return Math.max(...swings);
}

export function classifySwingBucket(pips: number | null): SwingBucket | null {
  if (pips == null) return null;
  if (pips < 8) return 'LOW';
  if (pips < 15) return 'MEDIUM';
  return 'HIGH';
}

export function classifyQualBucket(score: number | null): QualBucket | null {
  if (score == null) return null;
  if (score >= 0.65) return 'HIGH';
  if (score >= 0.45) return 'MEDIUM';
  return 'LOW';
}

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function confirmedRate(rows: AsianSwingRow[]): number | null {
  const confirmable = rows.filter((row) => row.window_direction_confirmed !== null);
  if (confirmable.length === 0) return null;
  const confirmed = confirmable.filter((row) => row.window_direction_confirmed === true).length;
  return pct(confirmed, confirmable.length);
}

function avgAbsWindowPips(rows: AsianSwingRow[]): number | null {
  const withPips = rows.filter((row) => row.window_pip_move !== null);
  if (withPips.length === 0) return null;
  const sum = withPips.reduce((acc, row) => acc + Math.abs(row.window_pip_move ?? 0), 0);
  return Math.round((sum / withPips.length) * 10) / 10;
}

export function computeRowMetrics(sourceRow: AmdAsianSourceRow): AsianSwingRow {
  const asianMaxSwingPips = deriveAsianMaxSwingPips(sourceRow.chart_data);
  return {
    trade_date: sourceRow.trade_date,
    outcome_tag: sourceRow.amd_outcome_tag,
    asian_max_swing_pips: asianMaxSwingPips,
    swing_bucket: classifySwingBucket(asianMaxSwingPips),
    accumulation_quality_score: sourceRow.accumulation_quality_score,
    qual_bucket: classifyQualBucket(sourceRow.accumulation_quality_score),
    asian_range_pips: sourceRow.asian_range_pips,
    asian_net_pips: sourceRow.asian_net_pips,
    judas_timing: sourceRow.judas_timing,
    daily_bias_alignment: sourceRow.daily_bias_alignment,
    window_direction_confirmed: sourceRow.window_direction_confirmed,
    window_pip_move: sourceRow.window_pip_move,
  };
}

export function aggregateBySwingOutcome(rows: AsianSwingRow[]): SwingOutcomeAggregate[] {
  const valid = rows.filter((row) => row.swing_bucket !== null);
  const total = valid.length;
  const buckets: SwingBucket[] = ['LOW', 'MEDIUM', 'HIGH'];
  const outcomeTags = [...new Set(valid.map((row) => row.outcome_tag))].sort();
  const aggregates: SwingOutcomeAggregate[] = [];

  for (const swingBucket of buckets) {
    for (const outcomeTag of outcomeTags) {
      const bucketRows = valid.filter(
        (row) => row.swing_bucket === swingBucket && row.outcome_tag === outcomeTag,
      );
      if (bucketRows.length === 0) continue;
      aggregates.push({
        swing_bucket: swingBucket,
        outcome_tag: outcomeTag,
        n: bucketRows.length,
        direction_confirmed_rate: confirmedRate(bucketRows),
        avg_window_pip_move_abs: avgAbsWindowPips(bucketRows),
        pct_of_total: total > 0 ? pct(bucketRows.length, total) : 0,
      });
    }
  }
  return aggregates;
}

export function aggregateBySwingQual(rows: AsianSwingRow[]): SwingQualAggregate[] {
  const valid = rows.filter((row) => row.swing_bucket !== null && row.qual_bucket !== null);
  const buckets: SwingBucket[] = ['LOW', 'MEDIUM', 'HIGH'];
  const qualBuckets: QualBucket[] = ['HIGH', 'MEDIUM', 'LOW'];
  const aggregates: SwingQualAggregate[] = [];

  for (const swingBucket of buckets) {
    for (const qualBucket of qualBuckets) {
      const bucketRows = valid.filter(
        (row) => row.swing_bucket === swingBucket && row.qual_bucket === qualBucket,
      );
      if (bucketRows.length === 0) continue;
      aggregates.push({
        swing_bucket: swingBucket,
        qual_bucket: qualBucket,
        n: bucketRows.length,
        direction_confirmed_rate: confirmedRate(bucketRows),
        avg_window_pip_move_abs: avgAbsWindowPips(bucketRows),
      });
    }
  }
  return aggregates;
}

function csvLine(values: Array<string | number | boolean | null>): string {
  return values.map((value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return text.includes(',') ? `"${text}"` : text;
  }).join(',');
}

export function writeCsvs(
  rows: AsianSwingRow[],
  byOutcome: SwingOutcomeAggregate[],
  byQual: SwingQualAggregate[],
): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const outcomePath = path.join(OUTPUT_DIR, 'asian_swing_by_outcome.csv');
  const outcomeHeader = [
    'swing_bucket', 'outcome_tag', 'n', 'direction_confirmed_rate',
    'avg_window_pip_move_abs', 'pct_of_total',
  ].join(',');
  const outcomeLines = byOutcome.map((row) => csvLine([
    row.swing_bucket, row.outcome_tag, row.n, row.direction_confirmed_rate,
    row.avg_window_pip_move_abs, row.pct_of_total,
  ]));
  fs.writeFileSync(outcomePath, [outcomeHeader, ...outcomeLines].join('\n') + '\n');

  const qualPath = path.join(OUTPUT_DIR, 'asian_swing_by_qual_bucket.csv');
  const qualHeader = [
    'swing_bucket', 'qual_bucket', 'n', 'direction_confirmed_rate', 'avg_window_pip_move_abs',
  ].join(',');
  const qualLines = byQual.map((row) => csvLine([
    row.swing_bucket, row.qual_bucket, row.n, row.direction_confirmed_rate, row.avg_window_pip_move_abs,
  ]));
  fs.writeFileSync(qualPath, [qualHeader, ...qualLines].join('\n') + '\n');

  const rawPath = path.join(OUTPUT_DIR, 'asian_swing_raw.csv');
  const rawHeader = [
    'trade_date', 'outcome_tag', 'asian_max_swing_pips', 'swing_bucket',
    'accumulation_quality_score', 'qual_bucket', 'asian_range_pips', 'asian_net_pips',
    'judas_timing', 'daily_bias_alignment', 'window_direction_confirmed', 'window_pip_move',
  ].join(',');
  const rawLines = rows.map((row) => csvLine([
    row.trade_date, row.outcome_tag, row.asian_max_swing_pips, row.swing_bucket,
    row.accumulation_quality_score, row.qual_bucket, row.asian_range_pips, row.asian_net_pips,
    row.judas_timing, row.daily_bias_alignment, row.window_direction_confirmed, row.window_pip_move,
  ]));
  fs.writeFileSync(rawPath, [rawHeader, ...rawLines].join('\n') + '\n');

  console.log(`\nCSV: ${outcomePath}`);
  console.log(`CSV: ${qualPath}`);
  console.log(`CSV: ${rawPath}`);
}

function rateForBucketOutcome(
  rows: AsianSwingRow[],
  swingBucket: SwingBucket,
  outcomeTag: string,
): string {
  const bucket = rows.filter(
    (row) => row.swing_bucket === swingBucket && row.outcome_tag === outcomeTag,
  );
  const rate = confirmedRate(bucket);
  return rate == null ? 'N/A' : `${rate}%`;
}

function printConsoleSummary(rows: AsianSwingRow[], skipped: number): void {
  const valid = rows.filter((row) => row.swing_bucket !== null);
  console.log('\n=== ASIAN SWING ANALYSIS ===');
  console.log(`Total rows processed: ${rows.length}`);
  console.log(`Skipped (null chart_data or <4 Asian candles): ${skipped}`);

  const bucketCounts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const row of valid) {
    if (row.swing_bucket) bucketCounts[row.swing_bucket] += 1;
  }
  const totalValid = valid.length;
  console.log('\nSwing distribution:');
  console.log(`  LOW  (<8p):   ${bucketCounts.LOW} days (${pct(bucketCounts.LOW, totalValid)}%)`);
  console.log(`  MED  (8-14p): ${bucketCounts.MEDIUM} days (${pct(bucketCounts.MEDIUM, totalValid)}%)`);
  console.log(`  HIGH (>=15p): ${bucketCounts.HIGH} days (${pct(bucketCounts.HIGH, totalValid)}%)`);

  console.log('\nDirection confirmed rate by swing bucket:');
  for (const swingBucket of ['LOW', 'MEDIUM', 'HIGH'] as const) {
    console.log(
      `  ${swingBucket.padEnd(6)}: TEXTBOOK ${rateForBucketOutcome(valid, swingBucket, 'AMD_TEXTBOOK')}  ` +
      `COMPRESSION ${rateForBucketOutcome(valid, swingBucket, 'AMD_COMPRESSION_BREAKOUT')}  ` +
      `FAILED ${rateForBucketOutcome(valid, swingBucket, 'AMD_FAILED')}`,
    );
  }

  const todayRow = rows.find((row) => row.trade_date === TODAY_TRADE_DATE);
  console.log(`\nTODAY (${TODAY_TRADE_DATE}):`);
  if (!todayRow) {
    console.log('  (row not found in filtered dataset)');
  } else {
    console.log(
      `  asian_max_swing_pips: ${todayRow.asian_max_swing_pips ?? 'N/A'}p  → bucket: ${todayRow.swing_bucket ?? 'N/A'}`,
    );
    console.log(
      `  qual: ${todayRow.accumulation_quality_score?.toFixed(2) ?? 'N/A'} (${todayRow.qual_bucket ?? 'N/A'})`,
    );
    console.log(`  judas_timing: ${todayRow.judas_timing ?? 'N/A'}`);
    console.log(`  outcome: ${todayRow.outcome_tag ?? 'PENDING'}`);
  }

  console.log('\nKey question: Does HIGH swing degrade confirmed rate');
  console.log('independent of quality score? → See CSV 2.');
}

export async function fetchAmdRows(supabase: SupabaseClient): Promise<AmdAsianSourceRow[]> {
  const { data, error } = await supabase
    .from('amd_state')
    .select(AMD_STATE_SELECT)
    .eq('pair', PAIR)
    .in('amd_outcome_tag', ['AMD_TEXTBOOK', 'AMD_COMPRESSION_BREAKOUT', 'AMD_FAILED'])
    .not('chart_data', 'is', null)
    .order('trade_date', { ascending: true });

  if (error) throw new Error(`amd_state query failed: ${error.message}`);
  return (data ?? []) as AmdAsianSourceRow[];
}

export async function main(): Promise<void> {
  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const sourceRows = await fetchAmdRows(supabase);
  console.log(`[AsianSwing] Loaded ${sourceRows.length} amd_state rows`);

  const results: AsianSwingRow[] = [];
  let skipped = 0;

  for (const sourceRow of sourceRows) {
    if (!sourceRow.chart_data) {
      skipped += 1;
      continue;
    }
    const metrics = computeRowMetrics(sourceRow);
    if (metrics.asian_max_swing_pips === null) skipped += 1;
    results.push(metrics);
  }

  const byOutcome = aggregateBySwingOutcome(results);
  const byQual = aggregateBySwingQual(results);
  writeCsvs(results, byOutcome, byQual);
  printConsoleSummary(results, skipped);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
