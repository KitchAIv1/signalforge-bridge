/**
 * Judas timing analysis — EARLY (H8) vs LATE (H9) London extreme vs distribution follow-through.
 * READ-ONLY research — amd_state chart_data.ohlc + window outcome fields.
 *
 * Run: npx tsx scripts/amdJudasTimingAnalysis.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';
const OUTPUT_DIR = path.join(process.cwd(), 'scripts/output');
const JUDAS_MATCH_TOLERANCE_PIPS = 3;

export type JudasTiming = 'EARLY' | 'LATE';
export type D1Conviction = 'STRONG' | 'WEAK' | 'RANGING';

export interface ChartOhlcBar {
  time: string;
  o: string;
  h: string;
  l: string;
  c: string;
}

export interface AmdStateResearchRow {
  trade_date: string;
  judas_direction: 'UP' | 'DOWN';
  judas_pips: number | null;
  judas_extreme_price: number | null;
  amd_outcome_tag: string;
  window_direction_confirmed: boolean | null;
  window_pip_move: number | null;
  daily_bias_alignment: string | null;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
  chart_data: Record<string, unknown> | null;
}

export interface JudasTimingResult {
  trade_date: string;
  outcome_tag: string;
  judas_timing: JudasTiming | null;
  judas_extreme_utc_hour: number | null;
  judas_pips: number | null;
  direction_confirmed: boolean | null;
  window_pip_move: number | null;
  alignment: string | null;
  d1_conviction: D1Conviction;
}

export interface TimingOutcomeAggregate {
  judas_timing: JudasTiming;
  outcome_tag: string;
  n: number;
  direction_confirmed_rate: number | null;
  avg_window_pip_move: number | null;
  pct_of_total: number;
}

export interface TimingAlignmentAggregate extends TimingOutcomeAggregate {
  alignment: string;
}

const AMD_STATE_SELECT =
  'trade_date, judas_direction, judas_pips, judas_extreme_price, ' +
  'amd_outcome_tag, window_direction_confirmed, window_pip_move, ' +
  'daily_bias_alignment, layer4_bullish_count, layer4_bearish_count, chart_data';

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
    const o = row.o != null ? String(row.o) : '';
    const h = row.h != null ? String(row.h) : '';
    const l = row.l != null ? String(row.l) : '';
    const c = row.c != null ? String(row.c) : '';
    if (!o || !h || !l || !c) continue;
    bars.push({ time: row.time, o, h, l, c });
  }
  return bars;
}

function londonHourEightNineBars(bars: ChartOhlcBar[]): ChartOhlcBar[] {
  return bars.filter((bar) => {
    const utcHour = new Date(bar.time).getUTCHours();
    return utcHour === 8 || utcHour === 9;
  });
}

function pickClosestExtremeBar(
  londonBars: ChartOhlcBar[],
  judasDirection: 'UP' | 'DOWN',
  judasExtremePrice: number,
): ChartOhlcBar | null {
  if (londonBars.length === 0) return null;
  const seed = londonBars[0];
  if (judasDirection === 'UP') {
    return londonBars.reduce((best, candidate) =>
      Math.abs(parseFloat(candidate.h) - judasExtremePrice) <
      Math.abs(parseFloat(best.h) - judasExtremePrice) ? candidate : best,
    seed);
  }
  return londonBars.reduce((best, candidate) =>
    Math.abs(parseFloat(candidate.l) - judasExtremePrice) <
    Math.abs(parseFloat(best.l) - judasExtremePrice) ? candidate : best,
  seed);
}

function extremeDistancePips(
  bar: ChartOhlcBar,
  judasDirection: 'UP' | 'DOWN',
  judasExtremePrice: number,
): number {
  const price = judasDirection === 'UP' ? parseFloat(bar.h) : parseFloat(bar.l);
  return Math.round(Math.abs(price - judasExtremePrice) * 10000 * 10) / 10;
}

function timingFromHour(utcHour: number): JudasTiming | null {
  if (utcHour === 8) return 'EARLY';
  if (utcHour === 9) return 'LATE';
  return null;
}

export function deriveJudasHour(row: AmdStateResearchRow): number | null {
  if (row.judas_extreme_price == null || !row.chart_data) return null;
  const londonBars = londonHourEightNineBars(parseChartOhlc(row.chart_data));
  const matched = pickClosestExtremeBar(londonBars, row.judas_direction, row.judas_extreme_price);
  if (!matched) return null;
  const distancePips = extremeDistancePips(matched, row.judas_direction, row.judas_extreme_price);
  if (distancePips > JUDAS_MATCH_TOLERANCE_PIPS) {
    console.warn(
      `[JudasTiming] ${row.trade_date}: no London H8/H9 bar within ${JUDAS_MATCH_TOLERANCE_PIPS}p ` +
      `(closest=${distancePips}p) — skipping`,
    );
    return null;
  }
  return new Date(matched.time).getUTCHours();
}

export function computeD1Conviction(
  bullishCount: number | null,
  bearishCount: number | null,
): D1Conviction {
  const bull = bullishCount ?? 0;
  const bear = bearishCount ?? 0;
  const dominant = Math.max(bull, bear);
  if (dominant >= 4) return 'STRONG';
  if (dominant === 3) return 'WEAK';
  return 'RANGING';
}

export function computeRowMetrics(row: AmdStateResearchRow): JudasTimingResult {
  const judasHour = deriveJudasHour(row);
  return {
    trade_date: row.trade_date,
    outcome_tag: row.amd_outcome_tag,
    judas_timing: judasHour == null ? null : timingFromHour(judasHour),
    judas_extreme_utc_hour: judasHour,
    judas_pips: row.judas_pips,
    direction_confirmed: row.window_direction_confirmed,
    window_pip_move: row.window_pip_move,
    alignment: row.daily_bias_alignment,
    d1_conviction: computeD1Conviction(row.layer4_bullish_count, row.layer4_bearish_count),
  };
}

function confirmedRate(rows: JudasTimingResult[]): number | null {
  const confirmable = rows.filter((row) => row.direction_confirmed !== null);
  if (confirmable.length === 0) return null;
  const confirmed = confirmable.filter((row) => row.direction_confirmed === true).length;
  return Math.round((confirmed / confirmable.length) * 1000) / 10;
}

function avgWindowPips(rows: JudasTimingResult[]): number | null {
  const withPips = rows.filter((row) => row.window_pip_move !== null);
  if (withPips.length === 0) return null;
  const sum = withPips.reduce((acc, row) => acc + (row.window_pip_move ?? 0), 0);
  return Math.round((sum / withPips.length) * 10) / 10;
}

function outcomeShortLabel(outcomeTag: string): string {
  if (outcomeTag === 'AMD_TEXTBOOK') return 'TEXTBOOK';
  if (outcomeTag === 'AMD_COMPRESSION_BREAKOUT') return 'COMPRESSION';
  if (outcomeTag === 'AMD_FAILED') return 'FAILED';
  return outcomeTag;
}

export function aggregateByBucket(rows: JudasTimingResult[]): {
  byOutcome: TimingOutcomeAggregate[];
  byAlignment: TimingAlignmentAggregate[];
} {
  const timedRows = rows.filter((row) => row.judas_timing !== null);
  const total = timedRows.length;
  const timings: JudasTiming[] = ['EARLY', 'LATE'];
  const outcomeTags = [...new Set(timedRows.map((row) => row.outcome_tag))].sort();
  const alignments = [...new Set(
    timedRows.map((row) => row.alignment ?? 'UNKNOWN'),
  )].sort();

  const byOutcome: TimingOutcomeAggregate[] = [];
  for (const timing of timings) {
    for (const outcomeTag of outcomeTags) {
      const bucket = timedRows.filter(
        (row) => row.judas_timing === timing && row.outcome_tag === outcomeTag,
      );
      if (bucket.length === 0) continue;
      byOutcome.push({
        judas_timing: timing,
        outcome_tag: outcomeTag,
        n: bucket.length,
        direction_confirmed_rate: confirmedRate(bucket),
        avg_window_pip_move: avgWindowPips(bucket),
        pct_of_total: total > 0 ? Math.round((bucket.length / total) * 1000) / 10 : 0,
      });
    }
  }

  const byAlignment: TimingAlignmentAggregate[] = [];
  for (const timing of timings) {
    for (const outcomeTag of outcomeTags) {
      for (const alignment of alignments) {
        const bucket = timedRows.filter(
          (row) =>
            row.judas_timing === timing &&
            row.outcome_tag === outcomeTag &&
            (row.alignment ?? 'UNKNOWN') === alignment,
        );
        if (bucket.length === 0) continue;
        byAlignment.push({
          judas_timing: timing,
          outcome_tag: outcomeTag,
          alignment,
          n: bucket.length,
          direction_confirmed_rate: confirmedRate(bucket),
          avg_window_pip_move: avgWindowPips(bucket),
          pct_of_total: total > 0 ? Math.round((bucket.length / total) * 1000) / 10 : 0,
        });
      }
    }
  }

  return { byOutcome, byAlignment };
}

function csvLine(values: Array<string | number | boolean | null>): string {
  return values.map((value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return text.includes(',') ? `"${text}"` : text;
  }).join(',');
}

export function writeCsvs(
  allRows: JudasTimingResult[],
  aggregates: ReturnType<typeof aggregateByBucket>,
): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const outcomePath = path.join(OUTPUT_DIR, 'judas_timing_by_outcome.csv');
  const outcomeHeader = [
    'judas_timing', 'outcome_tag', 'n', 'direction_confirmed_rate',
    'avg_window_pip_move', 'pct_of_total',
  ].join(',');
  const outcomeLines = aggregates.byOutcome.map((row) => csvLine([
    row.judas_timing, row.outcome_tag, row.n, row.direction_confirmed_rate,
    row.avg_window_pip_move, row.pct_of_total,
  ]));
  fs.writeFileSync(outcomePath, [outcomeHeader, ...outcomeLines].join('\n') + '\n');

  const alignmentPath = path.join(OUTPUT_DIR, 'judas_timing_by_alignment.csv');
  const alignmentHeader = [
    'judas_timing', 'outcome_tag', 'alignment', 'n',
    'direction_confirmed_rate', 'avg_window_pip_move',
  ].join(',');
  const alignmentLines = aggregates.byAlignment.map((row) => csvLine([
    row.judas_timing, row.outcome_tag, row.alignment, row.n,
    row.direction_confirmed_rate, row.avg_window_pip_move,
  ]));
  fs.writeFileSync(alignmentPath, [alignmentHeader, ...alignmentLines].join('\n') + '\n');

  const rawPath = path.join(OUTPUT_DIR, 'judas_timing_raw.csv');
  const rawHeader = [
    'trade_date', 'outcome_tag', 'judas_timing', 'judas_extreme_utc_hour',
    'judas_pips', 'direction_confirmed', 'window_pip_move', 'alignment', 'd1_conviction',
  ].join(',');
  const rawLines = allRows.map((row) => csvLine([
    row.trade_date, row.outcome_tag, row.judas_timing, row.judas_extreme_utc_hour,
    row.judas_pips, row.direction_confirmed, row.window_pip_move, row.alignment, row.d1_conviction,
  ]));
  fs.writeFileSync(rawPath, [rawHeader, ...rawLines].join('\n') + '\n');

  console.log(`\nCSV: ${outcomePath}`);
  console.log(`CSV: ${alignmentPath}`);
  console.log(`CSV: ${rawPath}`);
}

function printTimingBlock(
  label: string,
  timing: JudasTiming,
  rows: JudasTimingResult[],
): void {
  console.log(`\n${label} Judas (${timing === 'EARLY' ? 'H8' : 'H9'}):`);
  for (const outcomeTag of ['AMD_TEXTBOOK', 'AMD_COMPRESSION_BREAKOUT', 'AMD_FAILED']) {
    const bucket = rows.filter(
      (row) => row.judas_timing === timing && row.outcome_tag === outcomeTag,
    );
    const rate = confirmedRate(bucket);
    const avgPips = avgWindowPips(bucket);
    console.log(
      `  ${outcomeShortLabel(outcomeTag).padEnd(11)}: n=${String(bucket.length).padStart(3)}  ` +
      `confirmed=${rate == null ? 'N/A' : `${rate}%`}  avg_pips=${avgPips ?? 'N/A'}`,
    );
  }
}

export function printConsoleSummary(
  processed: JudasTimingResult[],
  skipped: number,
): void {
  const timed = processed.filter((row) => row.judas_timing !== null);
  console.log('\n=== JUDAS TIMING ANALYSIS ===');
  console.log(`Total rows processed: ${processed.length}`);
  console.log(`Skipped (null chart_data or no London extreme found): ${skipped}`);

  printTimingBlock('EARLY', 'EARLY', timed);
  printTimingBlock('LATE', 'LATE', timed);

  const earlyAll = timed.filter((row) => row.judas_timing === 'EARLY');
  const lateAll = timed.filter((row) => row.judas_timing === 'LATE');
  const earlyRate = confirmedRate(earlyAll);
  const lateRate = confirmedRate(lateAll);
  const delta = earlyRate != null && lateRate != null
    ? Math.round((lateRate - earlyRate) * 10) / 10
    : null;

  console.log(`\nOverall EARLY confirmed rate (all tags): ${earlyRate ?? 'N/A'}%`);
  console.log(`Overall LATE confirmed rate (all tags): ${lateRate ?? 'N/A'}%`);
  console.log(`Delta: ${delta == null ? 'N/A' : `${delta >= 0 ? '+' : ''}${delta} points`}`);
}

export async function fetchAmdStateRows(
  supabase: SupabaseClient,
): Promise<AmdStateResearchRow[]> {
  const { data, error } = await supabase
    .from('amd_state')
    .select(AMD_STATE_SELECT)
    .eq('pair', PAIR)
    .in('amd_outcome_tag', ['AMD_TEXTBOOK', 'AMD_COMPRESSION_BREAKOUT', 'AMD_FAILED'])
    .in('judas_direction', ['UP', 'DOWN'])
    .not('chart_data', 'is', null)
    .order('trade_date', { ascending: true });

  if (error) throw new Error(`amd_state query failed: ${error.message}`);
  return (data ?? []) as AmdStateResearchRow[];
}

export async function main(): Promise<void> {
  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const sourceRows = await fetchAmdStateRows(supabase);
  console.log(`[JudasTiming] Loaded ${sourceRows.length} amd_state rows`);

  const results: JudasTimingResult[] = [];
  let skipped = 0;

  for (const sourceRow of sourceRows) {
    if (!sourceRow.chart_data) {
      skipped += 1;
      continue;
    }
    const metrics = computeRowMetrics(sourceRow);
    if (metrics.judas_timing === null) {
      skipped += 1;
    }
    results.push(metrics);
  }

  const aggregates = aggregateByBucket(results);
  writeCsvs(results, aggregates);
  printConsoleSummary(results, skipped);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
