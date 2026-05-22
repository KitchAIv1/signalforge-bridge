/**
 * AMD distribution backtest — reads `amd_state.chart_data` only (no OANDA).
 * Run: npx ts-node scripts/amdDistributionBacktest.ts
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { csvEscape } from './amdBackfillCsv';

type ChartOhlcEntry = {
  time: string;
  o: string;
  h: string;
  l: string;
  c: string;
};

type AmdStateQueryRow = {
  trade_date: string;
  amd_tag: string;
  daily_bias_alignment: string | null;
  layer4_d1_bias: string | null;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
  judas_direction: string | null;
  judas_pips: number | null;
  asian_net_pips: number | null;
  asian_range_pips: number | null;
  reversal_confirmed: boolean | null;
  chart_data: Record<string, unknown> | null;
};

type BacktestRow = {
  trade_date: string;
  amd_tag: string;
  daily_bias_alignment: string | null;
  layer4_d1_bias: string | null;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
  judas_direction: string | null;
  judas_pips: number | null;
  asian_net_pips: number | null;
  asian_range_pips: number | null;
  reversal_confirmed: boolean | null;
  dist_candle_count: number;
  distribution_direction: string;
  distribution_pips: number;
  predicted_direction: string | null;
  alignment_correct: boolean | null;
};

function buildHistoricalSupabaseClient(): ReturnType<typeof createClient> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[AmdDistBacktest] Missing SUPABASE_URL or service key env var');
  }
  return createClient(supabaseUrl, supabaseKey);
}

function readOhlcFromChart(chartData: Record<string, unknown>): ChartOhlcEntry[] {
  const raw = chartData['ohlc'];
  if (!Array.isArray(raw)) return [];
  return raw as ChartOhlcEntry[];
}

function filterDistributionCandles(ohlc: ChartOhlcEntry[]): ChartOhlcEntry[] {
  const inWindow = ohlc.filter((candle) => {
    const utcHour = new Date(candle.time).getUTCHours();
    return utcHour >= 10 && utcHour <= 15;
  });
  return [...inWindow].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  );
}

function computeDistributionMetrics(distributionCandles: ChartOhlcEntry[]): {
  distribution_direction: string;
  distribution_pips: number;
} {
  const distOpen = parseFloat(distributionCandles[0].o);
  const distClose = parseFloat(
    distributionCandles[distributionCandles.length - 1].c,
  );
  const movePips = (distClose - distOpen) * 10000;
  const distribution_direction =
    movePips > 2 ? 'UP' : movePips < -2 ? 'DOWN' : 'FLAT';
  return {
    distribution_direction,
    distribution_pips: Math.abs(movePips),
  };
}

function predictFromJudasTags(amdTag: string, judasDirection: string | null): string | null {
  // TEXTBOOK and FAILED: Judas was fake — real move is opposite
  if (['AMD_TEXTBOOK', 'AMD_FAILED'].includes(amdTag)) {
    if (judasDirection === 'UP') return 'DOWN';
    if (judasDirection === 'DOWN') return 'UP';
    return null;
  }

  // COMPRESSION_BREAKOUT: London continued — real move is SAME as judas direction
  if (amdTag === 'AMD_COMPRESSION_BREAKOUT') {
    if (judasDirection === 'UP') return 'UP';
    if (judasDirection === 'DOWN') return 'DOWN';
    return null;
  }

  return null;
}

function predictFromD1Tags(
  amdTag: string,
  layer4Bias: string | null,
): string | null {
  if (!['AMD_SHIFTED', 'AMD_NONE'].includes(amdTag)) return null;
  if (layer4Bias === 'TRENDING_UP') return 'UP';
  if (layer4Bias === 'TRENDING_DOWN') return 'DOWN';
  return null;
}

function computePredictedDirection(row: AmdStateQueryRow): string | null {
  const judasPred = predictFromJudasTags(row.amd_tag, row.judas_direction);
  if (judasPred !== null || ['AMD_TEXTBOOK', 'AMD_COMPRESSION_BREAKOUT', 'AMD_FAILED'].includes(row.amd_tag)) {
    return judasPred;
  }
  return predictFromD1Tags(row.amd_tag, row.layer4_d1_bias);
}

function computeAlignmentCorrect(
  predictedDirection: string | null,
  distributionDirection: string,
): boolean | null {
  if (
    predictedDirection === null ||
    distributionDirection === 'FLAT' ||
    distributionDirection === 'INSUFFICIENT'
  ) {
    return null;
  }
  return predictedDirection === distributionDirection;
}

function rowToBacktestResult(row: AmdStateQueryRow): BacktestRow {
  const chartData =
    row.chart_data && typeof row.chart_data === 'object'
      ? (row.chart_data as Record<string, unknown>)
      : null;
  const ohlc = chartData ? readOhlcFromChart(chartData) : [];
  const distributionCandles = filterDistributionCandles(ohlc);

  let distribution_direction = 'INSUFFICIENT';
  let distribution_pips = 0;

  if (distributionCandles.length >= 2) {
    const m = computeDistributionMetrics(distributionCandles);
    distribution_direction = m.distribution_direction;
    distribution_pips = m.distribution_pips;
  }

  const predicted_direction = computePredictedDirection(row);
  const alignment_correct =
    distributionCandles.length < 2
      ? null
      : computeAlignmentCorrect(predicted_direction, distribution_direction);

  return {
    trade_date: row.trade_date,
    amd_tag: row.amd_tag,
    daily_bias_alignment: row.daily_bias_alignment,
    layer4_d1_bias: row.layer4_d1_bias,
    layer4_bullish_count: row.layer4_bullish_count,
    layer4_bearish_count: row.layer4_bearish_count,
    judas_direction: row.judas_direction,
    judas_pips: row.judas_pips,
    asian_net_pips: row.asian_net_pips,
    asian_range_pips: row.asian_range_pips,
    reversal_confirmed: row.reversal_confirmed,
    dist_candle_count: distributionCandles.length,
    distribution_direction,
    distribution_pips,
    predicted_direction,
    alignment_correct,
  };
}

function formatNullableBoolean(value: boolean | null): string {
  if (value === null) return 'null';
  return String(value);
}

function writeDistributionCsv(rows: BacktestRow[], csvPath: string): void {
  const headerColumns = [
    'trade_date',
    'amd_tag',
    'daily_bias_alignment',
    'layer4_d1_bias',
    'layer4_bullish_count',
    'layer4_bearish_count',
    'judas_direction',
    'judas_pips',
    'asian_net_pips',
    'asian_range_pips',
    'reversal_confirmed',
    'dist_candle_count',
    'distribution_direction',
    'distribution_pips',
    'predicted_direction',
    'alignment_correct',
  ];

  const lines = [headerColumns.join(',')];
  for (const recordRow of rows) {
    lines.push(
      [
        csvEscape(recordRow.trade_date),
        csvEscape(recordRow.amd_tag),
        csvEscape(recordRow.daily_bias_alignment),
        csvEscape(recordRow.layer4_d1_bias),
        csvEscape(recordRow.layer4_bullish_count),
        csvEscape(recordRow.layer4_bearish_count),
        csvEscape(recordRow.judas_direction),
        csvEscape(recordRow.judas_pips),
        csvEscape(recordRow.asian_net_pips),
        csvEscape(recordRow.asian_range_pips),
        csvEscape(recordRow.reversal_confirmed),
        csvEscape(recordRow.dist_candle_count),
        csvEscape(recordRow.distribution_direction),
        csvEscape(recordRow.distribution_pips),
        csvEscape(recordRow.predicted_direction),
        csvEscape(formatNullableBoolean(recordRow.alignment_correct)),
      ].join(','),
    );
  }
  fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
}

function predictedCorrectPct(alignmentValues: Array<boolean | null>): string {
  const scored = alignmentValues.filter((v): v is boolean => v !== null);
  if (scored.length === 0) return 'n/a';
  const hits = scored.filter(Boolean).length;
  return `${((100 * hits) / scored.length).toFixed(0)}%`;
}

function avgDistPips(pipsValues: number[]): string {
  if (pipsValues.length === 0) return '0.0';
  const sum = pipsValues.reduce((acc, pipValue) => acc + pipValue, 0);
  return (sum / pipsValues.length).toFixed(1);
}

type GroupKey = { tag: string; alignmentLabel: string };

function subgroupRows(
  allRows: BacktestRow[],
  tag: string,
  alignmentLabel: string,
): BacktestRow[] {
  return allRows.filter((r) => {
    if (r.amd_tag !== tag) return false;
    if (alignmentLabel === 'null') return r.daily_bias_alignment === null;
    return r.daily_bias_alignment === alignmentLabel;
  });
}

function printTagAlignmentLine(allRows: BacktestRow[], key: GroupKey): void {
  const sliceRows = subgroupRows(allRows, key.tag, key.alignmentLabel);
  const alignDisplay =
    key.alignmentLabel === 'null' ? 'null' : key.alignmentLabel;
  const predictedLabel = predictedCorrectPct(sliceRows.map((r) => r.alignment_correct));
  const avgLabel = avgDistPips(sliceRows.map((r) => r.distribution_pips));
  const paddedTag = key.tag.padEnd(24);
  console.log(
    `${paddedTag} | ${alignDisplay.padEnd(10)} | n=${sliceRows.length} | ` +
      `predicted_correct: ${predictedLabel} | avg_dist_pips: ${avgLabel}`,
  );
}

function printShiftedByBullishCount(allRows: BacktestRow[]): void {
  console.log('');
  console.log('--- SHIFTED Only: By D1 Bullish Count ---');
  for (let bullishCount = 5; bullishCount >= 0; bullishCount--) {
    const sliceRows = allRows.filter(
      (r) =>
        r.amd_tag === 'AMD_SHIFTED' &&
        r.layer4_bullish_count === bullishCount,
    );
    const predictedLabel = predictedCorrectPct(
      sliceRows.map((r) => r.alignment_correct),
    );
    const avgLabel = avgDistPips(sliceRows.map((r) => r.distribution_pips));
    console.log(
      `layer4_bullish_count=${bullishCount} | n=${sliceRows.length} | ` +
        `predicted_correct: ${predictedLabel} | avg_dist_pips: ${avgLabel}`,
    );
  }
}

async function runDistributionBacktest(): Promise<void> {
  dotenv.config();
  const supabase = buildHistoricalSupabaseClient();

  const { data, error } = await supabase
    .from('amd_state')
    .select(`
      trade_date,
      amd_tag,
      daily_bias_alignment,
      layer4_d1_bias,
      layer4_bullish_count,
      layer4_bearish_count,
      judas_direction,
      judas_pips,
      asian_net_pips,
      asian_range_pips,
      reversal_confirmed,
      chart_data
    `)
    .order('trade_date', { ascending: true });

  if (error) {
    throw new Error(`[AmdDistBacktest] Query failed: ${error.message}`);
  }

  const rawRows = (data ?? []) as AmdStateQueryRow[];
  let skippedNoChart = 0;
  const usableRows: AmdStateQueryRow[] = [];
  for (const dbRow of rawRows) {
    if (dbRow.chart_data === null || dbRow.chart_data === undefined) {
      skippedNoChart++;
      continue;
    }
    usableRows.push(dbRow);
  }

  const results = usableRows.map(rowToBacktestResult);
  let nullBiasCount = 0;
  for (const dbRow of usableRows) {
    if (dbRow.daily_bias_alignment === null) nullBiasCount++;
  }

  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, 'amd_distribution_backtest.csv');
  writeDistributionCsv(results, csvPath);

  console.log('=== AMD DISTRIBUTION BACKTEST — SUMMARY ===');
  console.log(
    `Total rows processed: ${results.length} | Rows skipped (no chart_data): ${skippedNoChart} | Rows with null bias: ${nullBiasCount}`,
  );

  console.log('');
  console.log('--- By AMD Tag + Alignment ---');
  const tagAlignmentGroups: GroupKey[] = [
    { tag: 'AMD_TEXTBOOK', alignmentLabel: 'ALIGNED' },
    { tag: 'AMD_TEXTBOOK', alignmentLabel: 'CONFLICTED' },
    { tag: 'AMD_TEXTBOOK', alignmentLabel: 'null' },
    { tag: 'AMD_SHIFTED', alignmentLabel: 'ALIGNED' },
    { tag: 'AMD_SHIFTED', alignmentLabel: 'CONFLICTED' },
    { tag: 'AMD_SHIFTED', alignmentLabel: 'RANGING' },
    { tag: 'AMD_SHIFTED', alignmentLabel: 'null' },
    { tag: 'AMD_COMPRESSION_BREAKOUT', alignmentLabel: 'ALIGNED' },
    { tag: 'AMD_COMPRESSION_BREAKOUT', alignmentLabel: 'CONFLICTED' },
    { tag: 'AMD_FAILED', alignmentLabel: 'ALIGNED' },
    { tag: 'AMD_FAILED', alignmentLabel: 'CONFLICTED' },
    { tag: 'AMD_NONE', alignmentLabel: 'ALIGNED' },
    { tag: 'AMD_NONE', alignmentLabel: 'CONFLICTED' },
  ];
  for (const groupKey of tagAlignmentGroups) {
    printTagAlignmentLine(results, groupKey);
  }

  printShiftedByBullishCount(results);
  console.log(`\n[AmdDistBacktest] CSV written: ${csvPath}`);
}

const scriptPath = process.argv[1] ?? '';
if (scriptPath.includes('amdDistributionBacktest')) {
  void runDistributionBacktest()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('[AmdDistBacktest] Fatal:', err);
      process.exit(1);
    });
}
