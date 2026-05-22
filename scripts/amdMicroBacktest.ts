/**
 * AMD micro backtest — Judas + per-hour distribution slices from amd_state.chart_data.
 * Run: npx ts-node scripts/amdMicroBacktest.ts
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { csvEscape } from './amdBackfillCsv';

const INSTRUMENT = 'AUD_USD';

const AMD_TAGS_FOR_SUMMARY = [
  'AMD_TEXTBOOK',
  'AMD_COMPRESSION_BREAKOUT',
  'AMD_SHIFTED',
  'AMD_FAILED',
  'AMD_NONE',
] as const;

const DISTRIBUTION_HOURS = [10, 11, 12, 13, 14, 15] as const;

function buildSupabaseClient(): ReturnType<typeof createClient> {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('[MicroBacktest] Missing SUPABASE_URL or service key');
  }
  return createClient(url, key);
}

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
  predicted_direction: string | null;
  chart_data: Record<string, unknown> | null;
};

type HourSliceResult = {
  trade_date: string;
  amd_tag: string;
  daily_bias_alignment: string;
  layer4_d1_bias: string;
  judas_direction: string;
  judas_pips: number;
  reversal_confirmed: string;
  asian_range_pips: number;
  predicted_direction: string;
  judas_window_direction: string;
  judas_window_pips: number;
  hour_10_direction: string;
  hour_10_pips: number;
  hour_10_correct: string;
  hour_11_direction: string;
  hour_11_pips: number;
  hour_11_correct: string;
  hour_12_direction: string;
  hour_12_pips: number;
  hour_12_correct: string;
  hour_13_direction: string;
  hour_13_pips: number;
  hour_13_correct: string;
  hour_14_direction: string;
  hour_14_pips: number;
  hour_14_correct: string;
  hour_15_direction: string;
  hour_15_pips: number;
  hour_15_correct: string;
  full_dist_direction: string;
  full_dist_pips: number;
  full_dist_correct: string;
  cumulative_10_correct: string;
  cumulative_11_correct: string;
  cumulative_12_correct: string;
  cumulative_13_correct: string;
};

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

function getCandlesForHourRange(
  ohlc: ChartOhlcEntry[],
  fromHourInclusive: number,
  toHourInclusive: number,
): ChartOhlcEntry[] {
  return ohlc
    .filter((candle) => {
      const hourUtc = new Date(candle.time).getUTCHours();
      return hourUtc >= fromHourInclusive && hourUtc <= toHourInclusive;
    })
    .sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    );
}

function computeDirectionAndPips(candles: ChartOhlcEntry[]): {
  direction: string;
  pips: number;
} {
  if (candles.length === 0) return { direction: 'NO_DATA', pips: 0 };
  const open = parseFloat(candles[0].o);
  const close = parseFloat(candles[candles.length - 1].c);
  const movePips = (close - open) * 10000;
  const direction =
    movePips > 2 ? 'UP' : movePips < -2 ? 'DOWN' : 'FLAT';
  return { direction, pips: parseFloat(Math.abs(movePips).toFixed(2)) };
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

function isCorrect(predicted: string, actual: string): string {
  if (
    predicted === 'NO_PREDICTION' ||
    actual === 'NO_DATA' ||
    actual === 'FLAT'
  ) {
    return 'n/a';
  }
  return predicted === actual ? 'true' : 'false';
}

function computeCumulative(
  ohlc: ChartOhlcEntry[],
  predicted: string,
  throughHour: number,
): string {
  const candles = getCandlesForHourRange(ohlc, 10, throughHour);
  const { direction } = computeDirectionAndPips(candles);
  return isCorrect(predicted, direction);
}

function processRow(row: AmdStateRow): HourSliceResult | null {
  if (!row.chart_data) return null;

  const ohlc = readOhlcFromChart(row.chart_data);
  if (ohlc.length === 0) return null;

  const predicted = computePredictedDirection(row);
  const judasCandles = getCandlesForHourRange(ohlc, 8, 9);
  const judasWindow = computeDirectionAndPips(judasCandles);

  const h10 = computeDirectionAndPips(getCandlesForHour(ohlc, 10));
  const h11 = computeDirectionAndPips(getCandlesForHour(ohlc, 11));
  const h12 = computeDirectionAndPips(getCandlesForHour(ohlc, 12));
  const h13 = computeDirectionAndPips(getCandlesForHour(ohlc, 13));
  const h14 = computeDirectionAndPips(getCandlesForHour(ohlc, 14));
  const h15 = computeDirectionAndPips(getCandlesForHour(ohlc, 15));
  const fullDist = computeDirectionAndPips(getCandlesForHourRange(ohlc, 10, 15));

  const cum10 = computeCumulative(ohlc, predicted, 10);
  const cum11 = computeCumulative(ohlc, predicted, 11);
  const cum12 = computeCumulative(ohlc, predicted, 12);
  const cum13 = computeCumulative(ohlc, predicted, 13);

  return {
    trade_date: row.trade_date,
    amd_tag: row.amd_tag,
    daily_bias_alignment: row.daily_bias_alignment ?? 'null',
    layer4_d1_bias: row.layer4_d1_bias ?? 'null',
    judas_direction: row.judas_direction ?? 'null',
    judas_pips: row.judas_pips ?? 0,
    reversal_confirmed: String(row.reversal_confirmed ?? 'null'),
    asian_range_pips: row.asian_range_pips ?? 0,
    predicted_direction: predicted,
    judas_window_direction: judasWindow.direction,
    judas_window_pips: judasWindow.pips,
    hour_10_direction: h10.direction,
    hour_10_pips: h10.pips,
    hour_10_correct: isCorrect(predicted, h10.direction),
    hour_11_direction: h11.direction,
    hour_11_pips: h11.pips,
    hour_11_correct: isCorrect(predicted, h11.direction),
    hour_12_direction: h12.direction,
    hour_12_pips: h12.pips,
    hour_12_correct: isCorrect(predicted, h12.direction),
    hour_13_direction: h13.direction,
    hour_13_pips: h13.pips,
    hour_13_correct: isCorrect(predicted, h13.direction),
    hour_14_direction: h14.direction,
    hour_14_pips: h14.pips,
    hour_14_correct: isCorrect(predicted, h14.direction),
    hour_15_direction: h15.direction,
    hour_15_pips: h15.pips,
    hour_15_correct: isCorrect(predicted, h15.direction),
    full_dist_direction: fullDist.direction,
    full_dist_pips: fullDist.pips,
    full_dist_correct: isCorrect(predicted, fullDist.direction),
    cumulative_10_correct: cum10,
    cumulative_11_correct: cum11,
    cumulative_12_correct: cum12,
    cumulative_13_correct: cum13,
  };
}

function pctFromCorrectFlags(flags: string[]): string {
  const scored = flags.filter((flag) => flag === 'true' || flag === 'false');
  if (scored.length === 0) return 'n/a';
  const hits = scored.filter((flag) => flag === 'true').length;
  return `${Math.round((100 * hits) / scored.length)}%`;
}

function avgPips(values: number[]): string {
  if (values.length === 0) return '0.0';
  const sum = values.reduce((acc, pipValue) => acc + pipValue, 0);
  return (sum / values.length).toFixed(1);
}

function hourFieldPrefix(hourUtc: number): string {
  return `hour_${hourUtc}`;
}

function getHourStats(
  rows: HourSliceResult[],
  hourUtc: number,
): { n: number; correctPct: string; avgPips: string; noData: number } {
  const prefix = hourFieldPrefix(hourUtc);
  const directionKey = `${prefix}_direction` as keyof HourSliceResult;
  const pipsKey = `${prefix}_pips` as keyof HourSliceResult;
  const correctKey = `${prefix}_correct` as keyof HourSliceResult;

  const withData = rows.filter((row) => row[directionKey] !== 'NO_DATA');
  const noData = rows.length - withData.length;
  const correctFlags = withData.map((row) => String(row[correctKey]));
  const pipsValues = withData.map((row) => Number(row[pipsKey]));

  return {
    n: withData.length,
    correctPct: pctFromCorrectFlags(correctFlags),
    avgPips: avgPips(pipsValues),
    noData,
  };
}

function printHourLine(label: string, stats: ReturnType<typeof getHourStats>): void {
  console.log(
    `${label} | n=${stats.n} | correct: ${stats.correctPct} | ` +
      `avg_pips: ${stats.avgPips} | NO_DATA: ${stats.noData}`,
  );
}

function printDistributionHourSummary(rows: HourSliceResult[]): void {
  console.log('--- Prediction Accuracy By Distribution Hour (all AMD tags) ---');
  for (const hourUtc of DISTRIBUTION_HOURS) {
    printHourLine(`Hour ${hourUtc}`, getHourStats(rows, hourUtc));
  }
  const fullStats = {
    n: rows.filter((row) => row.full_dist_direction !== 'NO_DATA').length,
    correctPct: pctFromCorrectFlags(rows.map((row) => row.full_dist_correct)),
    avgPips: avgPips(rows.map((row) => row.full_dist_pips)),
    noData: rows.filter((row) => row.full_dist_direction === 'NO_DATA').length,
  };
  printHourLine('Full distribution (10-15)', fullStats);
}

function printCumulativeSummary(rows: HourSliceResult[]): void {
  console.log('');
  console.log(
    '--- Cumulative Accuracy: Does Prediction Strengthen Through Distribution? ---',
  );
  const cumKeys: Array<[string, keyof HourSliceResult]> = [
    ['By end of hour 10', 'cumulative_10_correct'],
    ['By end of hour 11', 'cumulative_11_correct'],
    ['By end of hour 12', 'cumulative_12_correct'],
    ['By end of hour 13', 'cumulative_13_correct'],
  ];
  for (const [label, key] of cumKeys) {
    const pct = pctFromCorrectFlags(rows.map((row) => String(row[key])));
    console.log(`${label} | correct: ${pct}`);
  }
}

function hourCorrectPctForTag(
  tagRows: HourSliceResult[],
  hourUtc: number,
): number | null {
  const prefix = hourFieldPrefix(hourUtc);
  const correctKey = `${prefix}_correct` as keyof HourSliceResult;
  const flags = tagRows.map((row) => String(row[correctKey]));
  const scored = flags.filter((flag) => flag === 'true' || flag === 'false');
  if (scored.length === 0) return null;
  const hits = scored.filter((flag) => flag === 'true').length;
  return Math.round((100 * hits) / scored.length);
}

function findBestWorstHour(tagRows: HourSliceResult[]): {
  bestHour: number | null;
  bestPct: number | null;
  worstHour: number | null;
  worstPct: number | null;
} {
  let bestHour: number | null = null;
  let bestPct: number | null = null;
  let worstHour: number | null = null;
  let worstPct: number | null = null;

  for (const hourUtc of DISTRIBUTION_HOURS) {
    const pct = hourCorrectPctForTag(tagRows, hourUtc);
    if (pct === null) continue;
    if (bestPct === null || pct > bestPct) {
      bestPct = pct;
      bestHour = hourUtc;
    }
    if (worstPct === null || pct < worstPct) {
      worstPct = pct;
      worstHour = hourUtc;
    }
  }

  return { bestHour, bestPct, worstHour, worstPct };
}

function printTagBestHourSummary(rows: HourSliceResult[]): void {
  console.log('');
  console.log('--- By AMD Tag: Best Entry Hour (highest correct%) ---');
  for (const tag of AMD_TAGS_FOR_SUMMARY) {
    const tagRows = rows.filter((row) => row.amd_tag === tag);
    const { bestHour, bestPct, worstHour, worstPct } = findBestWorstHour(tagRows);
    const bestLabel =
      bestHour === null ? 'n/a (n/a)' : `${bestHour} (${bestPct}%)`;
    const worstLabel =
      worstHour === null ? 'n/a (n/a)' : `${worstHour} (${worstPct}%)`;
    console.log(
      `${tag.padEnd(24)} | best hour: ${bestLabel} | worst hour: ${worstLabel}`,
    );
  }
}

function printJudasWindowSummary(rows: HourSliceResult[]): void {
  console.log('');
  console.log('--- Judas Window Analysis ---');
  console.log('(Inversion tags = TEXTBOOK + FAILED | Continuation = COMPRESSION_BREAKOUT | D1 tags = SHIFTED + NONE)');

  // Split by tag group — prediction rule differs per group
  const inversionTags = ['AMD_TEXTBOOK', 'AMD_FAILED'];
  const continuationTags = ['AMD_COMPRESSION_BREAKOUT'];
  const d1Tags = ['AMD_SHIFTED', 'AMD_NONE'];

  // Inversion group: Judas UP → predicted DOWN, Judas DOWN → predicted UP
  const invUpRows = rows.filter(r =>
    inversionTags.includes(r.amd_tag) && r.judas_direction === 'UP'
  );
  const invDownRows = rows.filter(r =>
    inversionTags.includes(r.amd_tag) && r.judas_direction === 'DOWN'
  );

  // Continuation group: Judas UP → predicted UP, Judas DOWN → predicted DOWN
  const contUpRows = rows.filter(r =>
    continuationTags.includes(r.amd_tag) && r.judas_direction === 'UP'
  );
  const contDownRows = rows.filter(r =>
    continuationTags.includes(r.amd_tag) && r.judas_direction === 'DOWN'
  );

  // D1 group: Judas direction does not define prediction — show avg pips by Judas direction only
  const d1UpRows = rows.filter(r =>
    d1Tags.includes(r.amd_tag) && r.judas_direction === 'UP'
  );
  const d1DownRows = rows.filter(r =>
    d1Tags.includes(r.amd_tag) && r.judas_direction === 'DOWN'
  );

  console.log('');
  console.log('INVERSION TAGS (TEXTBOOK + FAILED) — Judas fake, distribution reverses:');
  console.log(
    `  Judas UP   → predicted DOWN | n=${invUpRows.length} | correct: ${pctFromCorrectFlags(invUpRows.map(r => r.full_dist_correct))} | avg judas pips: ${avgPips(invUpRows.map(r => r.judas_pips))}`
  );
  console.log(
    `  Judas DOWN → predicted UP   | n=${invDownRows.length} | correct: ${pctFromCorrectFlags(invDownRows.map(r => r.full_dist_correct))} | avg judas pips: ${avgPips(invDownRows.map(r => r.judas_pips))}`
  );

  console.log('');
  console.log('CONTINUATION TAG (COMPRESSION_BREAKOUT) — Judas continued:');
  console.log(
    `  Judas UP   → predicted UP   | n=${contUpRows.length} | correct: ${pctFromCorrectFlags(contUpRows.map(r => r.full_dist_correct))} | avg judas pips: ${avgPips(contUpRows.map(r => r.judas_pips))}`
  );
  console.log(
    `  Judas DOWN → predicted DOWN | n=${contDownRows.length} | correct: ${pctFromCorrectFlags(contDownRows.map(r => r.full_dist_correct))} | avg judas pips: ${avgPips(contDownRows.map(r => r.judas_pips))}`
  );

  console.log('');
  console.log('D1 TAGS (SHIFTED + NONE) — Judas not used for prediction, D1 bias governs:');
  console.log(
    `  Judas UP   (D1 predicts based on bias) | n=${d1UpRows.length} | D1 prediction correct: ${pctFromCorrectFlags(d1UpRows.map(r => r.full_dist_correct))} | avg judas pips: ${avgPips(d1UpRows.map(r => r.judas_pips))}`
  );
  console.log(
    `  Judas DOWN (D1 predicts based on bias) | n=${d1DownRows.length} | D1 prediction correct: ${pctFromCorrectFlags(d1DownRows.map(r => r.full_dist_correct))} | avg judas pips: ${avgPips(d1DownRows.map(r => r.judas_pips))}`
  );
}

function printReversalSummary(rows: HourSliceResult[]): void {
  console.log('');
  console.log('--- Reversal Confirmed vs Not: Accuracy by Hour ---');

  for (const reversalLabel of ['true', 'false'] as const) {
    const sliceRows = rows.filter(
      (row) => row.reversal_confirmed === reversalLabel,
    );
    const hourPcts = DISTRIBUTION_HOURS.slice(0, 4).map((hourUtc) => {
      const prefix = hourFieldPrefix(hourUtc);
      const correctKey = `${prefix}_correct` as keyof HourSliceResult;
      return pctFromCorrectFlags(sliceRows.map((row) => String(row[correctKey])));
    });
    console.log(
      `reversal_confirmed=${reversalLabel}  | hour 10: ${hourPcts[0]} | ` +
        `hour 11: ${hourPcts[1]} | hour 12: ${hourPcts[2]} | hour 13: ${hourPcts[3]}`,
    );
  }
}

function printMicroSummary(
  totalRows: number,
  skipped: number,
  rows: HourSliceResult[],
): void {
  console.log('=== AMD MICRO BACKTEST — DISTRIBUTION HOUR ANALYSIS ===');
  console.log(`Total rows from amd_state: ${totalRows}`);
  console.log(`Rows skipped (no chart_data or no ohlc): ${skipped}`);
  console.log(`Rows processed: ${rows.length}`);
  console.log('');
  printDistributionHourSummary(rows);
  printCumulativeSummary(rows);
  printTagBestHourSummary(rows);
  printJudasWindowSummary(rows);
  printReversalSummary(rows);
}

const CSV_COLUMNS: Array<keyof HourSliceResult> = [
  'trade_date',
  'amd_tag',
  'daily_bias_alignment',
  'layer4_d1_bias',
  'judas_direction',
  'judas_pips',
  'reversal_confirmed',
  'asian_range_pips',
  'predicted_direction',
  'judas_window_direction',
  'judas_window_pips',
  'hour_10_direction',
  'hour_10_pips',
  'hour_10_correct',
  'hour_11_direction',
  'hour_11_pips',
  'hour_11_correct',
  'hour_12_direction',
  'hour_12_pips',
  'hour_12_correct',
  'hour_13_direction',
  'hour_13_pips',
  'hour_13_correct',
  'hour_14_direction',
  'hour_14_pips',
  'hour_14_correct',
  'hour_15_direction',
  'hour_15_pips',
  'hour_15_correct',
  'full_dist_direction',
  'full_dist_pips',
  'full_dist_correct',
  'cumulative_10_correct',
  'cumulative_11_correct',
  'cumulative_12_correct',
  'cumulative_13_correct',
];

function writeMicroCsv(rows: HourSliceResult[], csvPath: string): void {
  const lines = [CSV_COLUMNS.join(',')];
  for (const recordRow of rows) {
    lines.push(
      CSV_COLUMNS.map((columnKey) => csvEscape(recordRow[columnKey])).join(','),
    );
  }
  fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
}

async function runMicroBacktest(): Promise<void> {
  dotenv.config();
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
    throw new Error(`[MicroBacktest] Query failed: ${error.message}`);
  }

  const rawRows = (data ?? []) as AmdStateRow[];
  const results: HourSliceResult[] = [];
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
  const csvPath = path.join(outDir, 'amd_micro_backtest.csv');
  writeMicroCsv(results, csvPath);

  printMicroSummary(rawRows.length, skipped, results);
  console.log(`\n[MicroBacktest] CSV written: ${csvPath}`);
}

const scriptPath = process.argv[1] ?? '';
if (scriptPath.includes('amdMicroBacktest')) {
  void runMicroBacktest()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('[MicroBacktest] Fatal:', err);
      process.exit(1);
    });
}
