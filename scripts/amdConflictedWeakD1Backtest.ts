/**
 * CONFLICTED D1 days — Judas inversion vs D1, split by weak/strong 5-candle votes.
 * Outcome: peak favorable ≥8 pips in predicted direction (first 36 M5 bars).
 * Data: amd_state + amd_m5_distribution_candles only (no OANDA).
 *
 * Run: npx tsx scripts/amdConflictedWeakD1Backtest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { csvEscape } from './amdBackfillCsv.js';
import {
  analyzeFirst36Window,
  classifyD1Strength,
  classifyTrendStability,
  d1BiasToDirection,
  isPeakMoveCorrect,
  judasInversionDirection,
  PEAK_TRADEABLE_PIPS,
} from './amdConflictedWeakD1/conflictedWeakD1Logic.js';
import type { M5Bar } from './regimeVsAmd/regimeVsAmdM5Walk.js';

dotenv.config();

const PAIR = 'AUD_USD';
const MIN_M5_BARS = 36;

const CSV_HEADERS = [
  'date',
  'amd_tag',
  'judas_direction',
  'judas_pips',
  'd1_strength',
  'd1_bullish_count',
  'd1_bearish_count',
  'actual_direction',
  'net_pips',
  'net_actual_direction',
  'peak_favorable_judas_pips',
  'peak_favorable_d1_pips',
  'judas_correct',
  'd1_correct',
  'transitioning',
] as const;

type CsvRow = Record<(typeof CSV_HEADERS)[number], string | number | boolean | null>;

type AmdRow = {
  trade_date: string;
  amd_tag: string;
  judas_direction: string | null;
  judas_pips: number | null;
  daily_bias_alignment: string | null;
  layer4_d1_bias: string | null;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
};

function buildSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or service role key');
  return createClient(url, key);
}

function boolCell(value: boolean | null): string {
  if (value == null) return '';
  return String(value);
}

function buildCsvRow(
  amdRow: AmdRow,
  candles: M5Bar[],
  biasByDate: Map<string, string | null>
): CsvRow | null {
  const judasPred = judasInversionDirection(amdRow.judas_direction);
  const d1Pred = d1BiasToDirection(amdRow.layer4_d1_bias);
  const analysis = analyzeFirst36Window(candles, judasPred, d1Pred);
  if (analysis == null) return null;

  const judasOk = isPeakMoveCorrect(
    analysis.peakFavorableJudas,
    judasPred != null
  );
  const d1Ok = isPeakMoveCorrect(analysis.peakFavorableD1, d1Pred != null);
  const trendFlag = classifyTrendStability(
    amdRow.trade_date,
    amdRow.layer4_d1_bias,
    biasByDate
  );

  return {
    date: amdRow.trade_date,
    amd_tag: amdRow.amd_tag,
    judas_direction: amdRow.judas_direction ?? '',
    judas_pips: amdRow.judas_pips ?? '',
    d1_strength: classifyD1Strength(
      amdRow.layer4_bullish_count,
      amdRow.layer4_bearish_count
    ),
    d1_bullish_count: amdRow.layer4_bullish_count ?? '',
    d1_bearish_count: amdRow.layer4_bearish_count ?? '',
    actual_direction: analysis.peakActualDirection,
    net_pips: analysis.netPips,
    net_actual_direction: analysis.netActualDirection,
    peak_favorable_judas_pips: analysis.peakFavorableJudas,
    peak_favorable_d1_pips: analysis.peakFavorableD1,
    judas_correct: boolCell(judasOk),
    d1_correct: boolCell(d1Ok),
    transitioning: trendFlag === 'transitioning' ? 'true' : 'false',
  };
}

async function loadAmdRows(supabase: ReturnType<typeof createClient>): Promise<AmdRow[]> {
  const { data, error } = await supabase
    .from('amd_state')
    .select(
      'trade_date, amd_tag, judas_direction, judas_pips, daily_bias_alignment, ' +
        'layer4_d1_bias, layer4_bullish_count, layer4_bearish_count'
    )
    .eq('pair', PAIR)
    .order('trade_date', { ascending: true });

  if (error) throw new Error(`amd_state: ${error.message}`);
  return (data ?? []) as AmdRow[];
}

async function loadM5Map(
  supabase: ReturnType<typeof createClient>
): Promise<Map<string, M5Bar[]>> {
  const { data, error } = await supabase
    .from('amd_m5_distribution_candles')
    .select('trade_date, candles, candle_count, fetch_status')
    .eq('pair', PAIR)
    .eq('fetch_status', 'success')
    .gte('candle_count', MIN_M5_BARS);

  if (error) throw new Error(`amd_m5_distribution_candles: ${error.message}`);

  const map = new Map<string, M5Bar[]>();
  for (const row of data ?? []) {
    map.set(row.trade_date as string, (row.candles ?? []) as M5Bar[]);
  }
  return map;
}

function writeCsv(rows: CsvRow[]): string {
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'amd_conflicted_weak_d1_backtest.csv');
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(CSV_HEADERS.map((col) => csvEscape(row[col])).join(','));
  }
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  return outPath;
}

type AccBucket = { total: number; judasCorrect: number; d1Scored: number; d1Correct: number };

function initBucket(): AccBucket {
  return { total: 0, judasCorrect: 0, d1Scored: 0, d1Correct: 0 };
}

function addRow(bucket: AccBucket, row: CsvRow): void {
  bucket.total += 1;
  if (row.judas_correct === 'true') bucket.judasCorrect += 1;
  if (row.d1_correct === 'true' || row.d1_correct === 'false') {
    bucket.d1Scored += 1;
    if (row.d1_correct === 'true') bucket.d1Correct += 1;
  }
}

function pct(correct: number, total: number): string {
  return total === 0 ? 'n/a' : `${Math.round((1000 * correct) / total) / 10}%`;
}

function printStrengthSummary(label: string, bucket: AccBucket): void {
  console.log(
    `  ${label} (n=${bucket.total}): ` +
      `Judas ${pct(bucket.judasCorrect, bucket.total)}, ` +
      `D1 ${pct(bucket.d1Correct, bucket.d1Scored)} ` +
      `(D1 scored n=${bucket.d1Scored})`
  );
}

function printSummary(rows: CsvRow[]): void {
  const weak = initBucket();
  const strong = initBucket();
  const other = initBucket();
  const all = initBucket();

  for (const row of rows) {
    addRow(all, row);
    if (row.d1_strength === 'weak') addRow(weak, row);
    else if (row.d1_strength === 'strong') addRow(strong, row);
    else addRow(other, row);
  }

  console.log(
    `\n=== CONFLICTED D1 — peak favorable ≥${PEAK_TRADEABLE_PIPS} pips (first 36 M5 bars) ===`
  );
  console.log(`CONFLICTED days in CSV: ${rows.length}`);
  printStrengthSummary('ALL CONFLICTED', all);
  printStrengthSummary('WEAK D1 (bull=2 or bear=2)', weak);
  printStrengthSummary('STRONG D1 (dominant≥4)', strong);
  if (other.total > 0) printStrengthSummary('OTHER D1 strength', other);

  const stable = rows.filter((row) => row.transitioning === 'false');
  const trans = rows.filter((row) => row.transitioning === 'true');
  const stableBucket = initBucket();
  const transBucket = initBucket();
  for (const row of stable) addRow(stableBucket, row);
  for (const row of trans) addRow(transBucket, row);

  console.log('\nBy D1 trend stability (vs prior 2 amd_state days):');
  printStrengthSummary('stable_trend', stableBucket);
  printStrengthSummary('transitioning', transBucket);
}

async function main(): Promise<void> {
  const supabase = buildSupabase();
  const amdRows = await loadAmdRows(supabase);
  const m5Map = await loadM5Map(supabase);

  const biasByDate = new Map<string, string | null>();
  for (const row of amdRows) {
    biasByDate.set(row.trade_date, row.layer4_d1_bias);
  }

  const conflicted = amdRows.filter((row) => row.daily_bias_alignment === 'CONFLICTED');
  const csvRows: CsvRow[] = [];
  let skippedNoM5 = 0;

  for (const amdRow of conflicted) {
    const candles = m5Map.get(amdRow.trade_date);
    if (!candles?.length) {
      skippedNoM5 += 1;
      continue;
    }
    const built = buildCsvRow(amdRow, candles, biasByDate);
    if (built != null) csvRows.push(built);
  }

  const outPath = writeCsv(csvRows);
  printSummary(csvRows);

  console.log(`\n[ConflictedWeakD1] amd_state total: ${amdRows.length}`);
  console.log(`[ConflictedWeakD1] CONFLICTED filtered: ${conflicted.length}`);
  console.log(`[ConflictedWeakD1] Skipped (no M5): ${skippedNoM5}`);
  console.log(`[ConflictedWeakD1] CSV: ${outPath}`);
}

main().catch((runErr) => {
  console.error('[ConflictedWeakD1] Fatal:', runErr);
  process.exitCode = 1;
});
