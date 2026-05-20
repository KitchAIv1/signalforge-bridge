/**
 * AMD peak & degradation backtest — favorable pip profile hours 10–15 from amd_state.chart_data.
 * Run: npx ts-node scripts/amdPeakDegradationBacktest.ts
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { csvEscape } from './amdBackfillCsv';

dotenv.config();

const INSTRUMENT = 'AUD_USD';
const DISTRIBUTION_HOURS = [10, 11, 12, 13, 14, 15] as const;

const SUMMARY_TAGS = [
  'AMD_TEXTBOOK',
  'AMD_COMPRESSION_BREAKOUT',
  'AMD_FAILED',
  'AMD_SHIFTED',
  'AMD_NONE',
] as const;

type ChartOhlcEntry = {
  time: string;
  o: string;
  h: string;
  l: string;
  c: string;
};

type AmdStateRow = {
  trade_date: string;
  amd_tag: string;
  daily_bias_alignment: string | null;
  layer4_d1_bias: string | null;
  judas_direction: string | null;
  judas_pips: number | null;
  reversal_confirmed: boolean | null;
  asian_range_pips: number | null;
  chart_data: Record<string, unknown> | null;
};

type HourProfile = {
  utc_hour: number;
  favorable_pips: number;
  close_pips: number;
  peak_so_far_pips: number;
  peak_vs_close_gap: number;
  still_advancing: boolean;
  hour_direction: string;
  no_data: boolean;
};

type OutputRow = {
  trade_date: string;
  amd_tag: string;
  daily_bias_alignment: string;
  judas_direction: string;
  judas_pips: number;
  reversal_confirmed: string;
  asian_range_pips: number;
  predicted_direction: string;
  hour10_ref_price: number;
  h10_favorable: number;
  h10_close: number;
  h10_peak: number;
  h10_gap: number;
  h10_advancing: string;
  h11_favorable: number;
  h11_close: number;
  h11_peak: number;
  h11_gap: number;
  h11_advancing: string;
  h12_favorable: number;
  h12_close: number;
  h12_peak: number;
  h12_gap: number;
  h12_advancing: string;
  h13_favorable: number;
  h13_close: number;
  h13_peak: number;
  h13_gap: number;
  h13_advancing: string;
  h14_favorable: number;
  h14_close: number;
  h14_peak: number;
  h14_gap: number;
  h14_advancing: string;
  h15_favorable: number;
  h15_close: number;
  h15_peak: number;
  h15_gap: number;
  h15_advancing: string;
  peak_hour: number;
  peak_favorable_pips: number;
  peak_close_pips: number;
  degradation_starts_hour: number;
};

const CSV_COLUMNS: Array<keyof OutputRow> = [
  'trade_date',
  'amd_tag',
  'daily_bias_alignment',
  'judas_direction',
  'judas_pips',
  'reversal_confirmed',
  'asian_range_pips',
  'predicted_direction',
  'hour10_ref_price',
  'h10_favorable',
  'h10_close',
  'h10_peak',
  'h10_gap',
  'h10_advancing',
  'h11_favorable',
  'h11_close',
  'h11_peak',
  'h11_gap',
  'h11_advancing',
  'h12_favorable',
  'h12_close',
  'h12_peak',
  'h12_gap',
  'h12_advancing',
  'h13_favorable',
  'h13_close',
  'h13_peak',
  'h13_gap',
  'h13_advancing',
  'h14_favorable',
  'h14_close',
  'h14_peak',
  'h14_gap',
  'h14_advancing',
  'h15_favorable',
  'h15_close',
  'h15_peak',
  'h15_gap',
  'h15_advancing',
  'peak_hour',
  'peak_favorable_pips',
  'peak_close_pips',
  'degradation_starts_hour',
];

function buildSupabaseClient(): ReturnType<typeof createClient> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[PeakDegradation] Missing SUPABASE_URL or service key env var');
  }
  return createClient(supabaseUrl, supabaseKey);
}

function readOhlcFromChart(chartData: Record<string, unknown>): ChartOhlcEntry[] {
  const raw = chartData['ohlc'];
  if (!Array.isArray(raw)) return [];
  return raw as ChartOhlcEntry[];
}

function getCandlesForHour(
  ohlc: ChartOhlcEntry[],
  utcHour: number,
): ChartOhlcEntry[] {
  return ohlc
    .filter((candle) => new Date(candle.time).getUTCHours() === utcHour)
    .sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    );
}

function getHour10Open(ohlc: ChartOhlcEntry[]): number | null {
  const hour10Candles = getCandlesForHour(ohlc, 10);
  if (hour10Candles.length === 0) return null;
  const parsed = parseFloat(hour10Candles[0].o);
  return Number.isFinite(parsed) ? parsed : null;
}

function computePredictedDirection(row: AmdStateRow): string {
  const tag = row.amd_tag;
  const judas = row.judas_direction;
  const d1 = row.layer4_d1_bias;

  if (['AMD_TEXTBOOK', 'AMD_FAILED'].includes(tag)) {
    if (judas === 'UP') return 'DOWN';
    if (judas === 'DOWN') return 'UP';
    return 'NO_PREDICTION';
  }

  if (tag === 'AMD_COMPRESSION_BREAKOUT') {
    if (judas === 'UP') return 'UP';
    if (judas === 'DOWN') return 'DOWN';
    return 'NO_PREDICTION';
  }

  if (['AMD_SHIFTED', 'AMD_NONE'].includes(tag)) {
    if (d1 === 'TRENDING_UP') return 'UP';
    if (d1 === 'TRENDING_DOWN') return 'DOWN';
    return 'NO_PREDICTION';
  }

  return 'NO_PREDICTION';
}

function computeHourProfile(
  ohlc: ChartOhlcEntry[],
  utcHour: number,
  predictedDirection: string,
  hour10RefPrice: number,
  previousHourFavorable: number,
  runningPeak: number,
): HourProfile {
  const candles = getCandlesForHour(ohlc, utcHour);

  if (candles.length === 0) {
    return {
      utc_hour: utcHour,
      favorable_pips: 0,
      close_pips: 0,
      peak_so_far_pips: runningPeak,
      peak_vs_close_gap: 0,
      still_advancing: false,
      hour_direction: 'NO_DATA',
      no_data: true,
    };
  }

  const candleHigh = Math.max(...candles.map((c) => parseFloat(c.h)));
  const candleLow = Math.min(...candles.map((c) => parseFloat(c.l)));
  const candleClose = parseFloat(candles[candles.length - 1].c);

  let favorablePips: number;
  let closePips: number;

  if (predictedDirection === 'UP') {
    favorablePips = parseFloat(((candleHigh - hour10RefPrice) * 10000).toFixed(2));
    closePips = parseFloat(((candleClose - hour10RefPrice) * 10000).toFixed(2));
  } else {
    favorablePips = parseFloat(((hour10RefPrice - candleLow) * 10000).toFixed(2));
    closePips = parseFloat(((hour10RefPrice - candleClose) * 10000).toFixed(2));
  }

  const peakSoFar = Math.max(runningPeak, favorablePips);
  const peakVsCloseGap = parseFloat((peakSoFar - closePips).toFixed(2));
  const stillAdvancing = favorablePips > previousHourFavorable;

  const netPips = (candleClose - parseFloat(candles[0].o)) * 10000;
  const hourDirection = netPips > 2 ? 'UP' : netPips < -2 ? 'DOWN' : 'FLAT';

  return {
    utc_hour: utcHour,
    favorable_pips: favorablePips,
    close_pips: closePips,
    peak_so_far_pips: peakSoFar,
    peak_vs_close_gap: peakVsCloseGap,
    still_advancing: stillAdvancing,
    hour_direction: hourDirection,
    no_data: false,
  };
}

function buildOutputFromProfiles(
  row: AmdStateRow,
  predicted: string,
  hour10RefPrice: number,
  profiles: HourProfile[],
  peakProfile: HourProfile,
  degradationStartsHour: number,
): OutputRow {
  const [h10, h11, h12, h13, h14, h15] = profiles;

  return {
    trade_date: row.trade_date,
    amd_tag: row.amd_tag,
    daily_bias_alignment: row.daily_bias_alignment ?? 'null',
    judas_direction: row.judas_direction ?? 'null',
    judas_pips: row.judas_pips ?? 0,
    reversal_confirmed: String(row.reversal_confirmed ?? 'null'),
    asian_range_pips: row.asian_range_pips ?? 0,
    predicted_direction: predicted,
    hour10_ref_price: parseFloat(hour10RefPrice.toFixed(5)),
    h10_favorable: h10?.favorable_pips ?? 0,
    h10_close: h10?.close_pips ?? 0,
    h10_peak: h10?.peak_so_far_pips ?? 0,
    h10_gap: h10?.peak_vs_close_gap ?? 0,
    h10_advancing: h10 ? String(h10.still_advancing) : 'n/a',
    h11_favorable: h11?.favorable_pips ?? 0,
    h11_close: h11?.close_pips ?? 0,
    h11_peak: h11?.peak_so_far_pips ?? 0,
    h11_gap: h11?.peak_vs_close_gap ?? 0,
    h11_advancing: h11 ? String(h11.still_advancing) : 'n/a',
    h12_favorable: h12?.favorable_pips ?? 0,
    h12_close: h12?.close_pips ?? 0,
    h12_peak: h12?.peak_so_far_pips ?? 0,
    h12_gap: h12?.peak_vs_close_gap ?? 0,
    h12_advancing: h12 ? String(h12.still_advancing) : 'n/a',
    h13_favorable: h13?.favorable_pips ?? 0,
    h13_close: h13?.close_pips ?? 0,
    h13_peak: h13?.peak_so_far_pips ?? 0,
    h13_gap: h13?.peak_vs_close_gap ?? 0,
    h13_advancing: h13 ? String(h13.still_advancing) : 'n/a',
    h14_favorable: h14?.favorable_pips ?? 0,
    h14_close: h14?.close_pips ?? 0,
    h14_peak: h14?.peak_so_far_pips ?? 0,
    h14_gap: h14?.peak_vs_close_gap ?? 0,
    h14_advancing: h14 ? String(h14.still_advancing) : 'n/a',
    h15_favorable: h15?.favorable_pips ?? 0,
    h15_close: h15?.close_pips ?? 0,
    h15_peak: h15?.peak_so_far_pips ?? 0,
    h15_gap: h15?.peak_vs_close_gap ?? 0,
    h15_advancing: h15 ? String(h15.still_advancing) : 'n/a',
    peak_hour: peakProfile.utc_hour,
    peak_favorable_pips: peakProfile.favorable_pips,
    peak_close_pips: peakProfile.close_pips,
    degradation_starts_hour: degradationStartsHour,
  };
}

function processRow(row: AmdStateRow): OutputRow | null {
  if (!row.chart_data) return null;

  const ohlc = readOhlcFromChart(row.chart_data);
  if (ohlc.length === 0) return null;

  const predicted = computePredictedDirection(row);
  if (predicted === 'NO_PREDICTION' || predicted === 'NO_DATA') return null;

  const hour10RefPrice = getHour10Open(ohlc);
  if (hour10RefPrice === null) return null;

  const profiles: HourProfile[] = [];
  let runningPeak = 0;
  let previousHourFavorable = 0;

  for (const hour of DISTRIBUTION_HOURS) {
    const profile = computeHourProfile(
      ohlc,
      hour,
      predicted,
      hour10RefPrice,
      previousHourFavorable,
      runningPeak,
    );
    profiles.push(profile);
    if (!profile.no_data) {
      previousHourFavorable = profile.favorable_pips;
      runningPeak = profile.peak_so_far_pips;
    }
  }

  const validProfiles = profiles.filter((profile) => !profile.no_data);
  if (validProfiles.length === 0) return null;

  const peakProfile = validProfiles.reduce((best, profile) =>
    profile.favorable_pips > best.favorable_pips ? profile : best,
  );

  let degradationStartsHour = -1;
  for (let index = 1; index < validProfiles.length; index++) {
    if (validProfiles[index].favorable_pips < validProfiles[index - 1].favorable_pips) {
      degradationStartsHour = validProfiles[index].utc_hour;
      break;
    }
  }

  return buildOutputFromProfiles(
    row,
    predicted,
    hour10RefPrice,
    profiles,
    peakProfile,
    degradationStartsHour,
  );
}

function rowsForTag(results: OutputRow[], tag: string): OutputRow[] {
  return results.filter((row) => row.amd_tag === tag);
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return 'n/a';
  return `${Math.round((100 * numerator) / denominator)}%`;
}

function avg(values: number[]): string {
  if (values.length === 0) return 'n/a';
  const sum = values.reduce((acc, value) => acc + value, 0);
  return (sum / values.length).toFixed(1);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function hourField(hour: number, metric: 'favorable' | 'close' | 'gap' | 'advancing'): keyof OutputRow {
  const map: Record<string, keyof OutputRow> = {
    '10_favorable': 'h10_favorable',
    '11_favorable': 'h11_favorable',
    '12_favorable': 'h12_favorable',
    '13_favorable': 'h13_favorable',
    '14_favorable': 'h14_favorable',
    '15_favorable': 'h15_favorable',
    '10_close': 'h10_close',
    '11_close': 'h11_close',
    '12_close': 'h12_close',
    '13_close': 'h13_close',
    '14_close': 'h14_close',
    '15_close': 'h15_close',
    '10_gap': 'h10_gap',
    '11_gap': 'h11_gap',
    '12_gap': 'h12_gap',
    '13_gap': 'h13_gap',
    '14_gap': 'h14_gap',
    '15_gap': 'h15_gap',
    '11_advancing': 'h11_advancing',
    '12_advancing': 'h12_advancing',
    '13_advancing': 'h13_advancing',
    '14_advancing': 'h14_advancing',
    '15_advancing': 'h15_advancing',
  };
  return map[`${hour}_${metric}`];
}

function printPeakHourTable(results: OutputRow[]): void {
  console.log('--- Peak Hour Distribution (when does each tag hit max favorable pips?) ---');
  console.log(
    'Tag                      | Peak hr 10 | Peak hr 11 | Peak hr 12 | Peak hr 13 | Peak hr 14 | Peak hr 15',
  );
  for (const tag of SUMMARY_TAGS) {
    const tagRows = rowsForTag(results, tag);
    const cells = DISTRIBUTION_HOURS.map((hour) =>
      pct(tagRows.filter((row) => row.peak_hour === hour).length, tagRows.length),
    );
    console.log(
      `${tag.padEnd(24)} | ${cells.map((cell) => cell.padStart(10)).join(' | ')}`,
    );
  }
}

function printHourMetricTable(
  results: OutputRow[],
  title: string,
  metric: 'favorable' | 'close' | 'gap',
): void {
  console.log('');
  console.log(title);
  console.log('Tag                      | Hr 10 | Hr 11 | Hr 12 | Hr 13 | Hr 14 | Hr 15');
  for (const tag of SUMMARY_TAGS) {
    const tagRows = rowsForTag(results, tag);
    const cells = DISTRIBUTION_HOURS.map((hour) => {
      const field = hourField(hour, metric);
      return avg(tagRows.map((row) => Number(row[field])));
    });
    console.log(
      `${tag.padEnd(24)} | ${cells.map((cell) => cell.padStart(5)).join(' | ')}`,
    );
  }
}

function printAdvancingTable(results: OutputRow[]): void {
  console.log('');
  console.log('--- % Days Still Advancing Per Hour (favorable > previous hour) ---');
  console.log('Tag                      | Hr 11 | Hr 12 | Hr 13 | Hr 14 | Hr 15');
  for (const tag of SUMMARY_TAGS) {
    const tagRows = rowsForTag(results, tag);
    const cells = [11, 12, 13, 14, 15].map((hour) => {
      const field = hourField(hour, 'advancing');
      const advancing = tagRows.filter((row) => row[field] === 'true').length;
      return pct(advancing, tagRows.length);
    });
    console.log(
      `${tag.padEnd(24)} | ${cells.map((cell) => cell.padStart(5)).join(' | ')}`,
    );
  }
  console.log('Note: When this drops below 50% = majority of days are no longer advancing');
}

function printDegradationTable(results: OutputRow[]): void {
  console.log('');
  console.log('--- Degradation Start Hour Distribution ---');
  console.log('Tag                      | Hr 11 | Hr 12 | Hr 13 | Hr 14 | Hr 15 | Never');
  for (const tag of SUMMARY_TAGS) {
    const tagRows = rowsForTag(results, tag);
    const hourCells = [11, 12, 13, 14, 15].map((hour) =>
      pct(tagRows.filter((row) => row.degradation_starts_hour === hour).length, tagRows.length),
    );
    const neverCell = pct(
      tagRows.filter((row) => row.degradation_starts_hour === -1).length,
      tagRows.length,
    );
    console.log(
      `${tag.padEnd(24)} | ${hourCells.map((cell) => cell.padStart(5)).join(' | ')} | ${neverCell.padStart(5)}`,
    );
  }
  console.log("Note: 'Never' = price kept advancing or flat through hour 15");
}

function printKeyFindings(results: OutputRow[]): void {
  console.log('');
  console.log('--- Key Finding Per Tag ---');
  for (const tag of SUMMARY_TAGS) {
    const tagRows = rowsForTag(results, tag);
    if (tagRows.length === 0) {
      console.log(`${tag}:`);
      console.log('  (no rows)');
      continue;
    }

    const avgPeakHour = avg(tagRows.map((row) => row.peak_hour));
    const avgPeakFavorable = avg(tagRows.map((row) => row.peak_favorable_pips));
    const degradationHours = tagRows
      .map((row) => row.degradation_starts_hour)
      .filter((hour) => hour >= 11);
    const medianDegradation = median(degradationHours);
    const beforeHour12 = pct(
      tagRows.filter((row) => row.peak_hour < 12).length,
      tagRows.length,
    );
    const atOrAfterHour12 = pct(
      tagRows.filter((row) => row.peak_hour >= 12).length,
      tagRows.length,
    );

    console.log(`${tag}:`);
    console.log(`  Avg peak hour: ${avgPeakHour} | Avg peak favorable: ${avgPeakFavorable} pips`);
    console.log(
      `  Median degradation starts: hour ${medianDegradation ?? 'n/a'}`,
    );
    console.log(`  % days where peak occurs BEFORE hour 12 (optimal entry): ${beforeHour12}`);
    console.log(`  % days where peak occurs AT OR AFTER hour 12: ${atOrAfterHour12}`);
    console.log('');
  }
}

function printPeakDegradationSummary(
  totalRows: number,
  skipped: number,
  results: OutputRow[],
): void {
  console.log('=== AMD PEAK & DEGRADATION ANALYSIS ===');
  console.log(`Total rows from amd_state: ${totalRows}`);
  console.log(`Rows skipped (no chart_data / no hour 10 / no prediction): ${skipped}`);
  console.log(`Rows processed: ${results.length}`);
  console.log('');

  printPeakHourTable(results);
  printHourMetricTable(
    results,
    '--- Average Favorable Pips Per Hour (from hour 10 open, using H/L) ---',
    'favorable',
  );
  printHourMetricTable(
    results,
    '--- Average Close Pips Per Hour (net settled position vs hour 10 open) ---',
    'close',
  );
  printHourMetricTable(
    results,
    '--- Average Peak vs Close Gap Per Hour (how many pips given back by close) ---',
    'gap',
  );
  console.log('Note: Higher gap = more intrabar move that was given back by close');
  printAdvancingTable(results);
  printDegradationTable(results);
  printKeyFindings(results);
}

function writePeakDegradationCsv(rows: OutputRow[], csvPath: string): void {
  const lines = [CSV_COLUMNS.join(',')];
  for (const recordRow of rows) {
    lines.push(
      CSV_COLUMNS.map((columnKey) => csvEscape(recordRow[columnKey])).join(','),
    );
  }
  fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
}

async function runPeakDegradationBacktest(): Promise<void> {
  const supabase = buildSupabaseClient();

  const { data, error } = await supabase
    .from('amd_state')
    .select(`
      trade_date,
      amd_tag,
      daily_bias_alignment,
      layer4_d1_bias,
      judas_direction,
      judas_pips,
      reversal_confirmed,
      asian_range_pips,
      chart_data
    `)
    .eq('pair', INSTRUMENT)
    .order('trade_date', { ascending: true });

  if (error) {
    throw new Error(`[PeakDegradation] Query failed: ${error.message}`);
  }

  const rawRows = (data ?? []) as AmdStateRow[];
  const results: OutputRow[] = [];
  let skipped = 0;

  for (const dbRow of rawRows) {
    const processed = processRow(dbRow);
    if (processed === null) {
      skipped++;
      continue;
    }
    results.push(processed);
  }

  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, 'amd_peak_degradation_backtest.csv');
  writePeakDegradationCsv(results, csvPath);

  printPeakDegradationSummary(rawRows.length, skipped, results);
  console.log(`\n[PeakDegradation] CSV written: ${csvPath}`);
}

const scriptPath = process.argv[1] ?? '';
if (scriptPath.includes('amdPeakDegradationBacktest')) {
  void runPeakDegradationBacktest()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('[PeakDegradation] Fatal:', err);
      process.exit(1);
    });
}
