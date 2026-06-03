/**
 * AMD accumulation / flat-logic backtest — 4 variants vs outcome ground truth.
 * READ-ONLY research — reads amd_state, writes CSV + console summary.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amdAccumulationBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  groupH1ByUtcHour,
  parseH1Candles,
} from './amdTcBacktest/h1Helpers.ts';

dotenv.config();

type SimulatedTag = 'AMD_FAILED' | 'AMD_SHIFTED' | 'AMD_NONE' | 'INSUFFICIENT_DATA';

type AmdAccumulationRow = {
  trade_date: string;
  amd_tag: string;
  amd_outcome_tag: string;
  asian_range_pips: number | null;
  asian_net_pips: number | null;
  asian_is_flat: boolean | null;
  asian_close_position_pct: number | null;
  judas_direction: string | null;
  judas_pips: number | null;
  reversal_confirmed: boolean | null;
  compression_breakout: boolean | null;
  chart_data: {
    ohlc: Array<{
      time: string;
      o: number | string;
      h: number | string;
      l: number | string;
      c: number | string;
    }>;
  };
  daily_bias_alignment: string | null;
  layer4_bullish_count: number | null;
};

type ComputedAccumulationRow = {
  trade_date: string;
  amd_outcome_tag: string;
  recomputedRangePips: number;
  netPips: number;
  netToRangeRatio: number;
  oscillationRatio: number;
  qualityScore: number;
  flat_current: boolean;
  flat_A: boolean;
  flat_B: boolean;
  flat_C: boolean;
  tag_current: SimulatedTag;
  tag_A: SimulatedTag;
  tag_B: SimulatedTag;
  tag_C: SimulatedTag;
};

type VariantKey = 'current' | 'A' | 'B' | 'C';

type VariantMetrics = {
  flatCount: number;
  correct: number;
  falseAmd: number;
  missedAmd: number;
};

const REAL_AMD_OUTCOMES = new Set([
  'AMD_TEXTBOOK',
  'AMD_COMPRESSION_BREAKOUT',
  'AMD_FAILED',
]);

const MISSED_AMD_OUTCOMES = new Set(['AMD_TEXTBOOK', 'AMD_COMPRESSION_BREAKOUT']);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (name === 'SUPABASE_SERVICE_ROLE_KEY') {
    const fallback = process.env.SUPABASE_SERVICE_KEY;
    if (fallback) return fallback;
  }
  throw new Error(`Missing required env var: ${name}`);
}

function collectAsianCandlesOrdered(
  candlesByHour: ReturnType<typeof groupH1ByUtcHour>,
): Array<{ o: number; h: number; l: number; c: number }> {
  const asianCandles: Array<{ o: number; h: number; l: number; c: number }> = [];
  for (let hour = 0; hour <= 7; hour += 1) {
    const candle = candlesByHour.get(hour);
    if (candle) asianCandles.push(candle);
  }
  return asianCandles;
}

function resolveSimulatedLiveTag(
  rangePips: number | null,
  isFlat: boolean,
  rangeThreshold: number = 35,
): SimulatedTag {
  if (rangePips == null) return 'INSUFFICIENT_DATA';
  if (rangePips >= 50) return 'AMD_NONE';
  if (rangePips >= rangeThreshold) return 'AMD_SHIFTED';
  if (isFlat) return 'AMD_FAILED';
  return 'AMD_SHIFTED';
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeRowFromChart(row: AmdAccumulationRow): ComputedAccumulationRow | null {
  const h1Candles = parseH1Candles(row.chart_data.ohlc);
  const candlesByHour = groupH1ByUtcHour(h1Candles);
  const candles = collectAsianCandlesOrdered(candlesByHour);

  if (candles.length === 0) return null;

  const asianHigh = Math.max(...candles.map((c) => c.h));
  const asianLow = Math.min(...candles.map((c) => c.l));
  const asianOpen = candles[0].o;
  const asianClose = candles[candles.length - 1].c;

  const recomputedRangePips = Math.round((asianHigh - asianLow) * 10000);
  const netPips = Math.round((asianClose - asianOpen) * 10000);
  const netToRangeRatio =
    recomputedRangePips > 0 ? Math.abs(netPips) / recomputedRangePips : 1;

  const overallUp = netPips > 0;
  let oppositeCount = 0;
  for (const candle of candles) {
    const up = candle.c > candle.o;
    if (overallUp && !up) oppositeCount += 1;
    if (!overallUp && up) oppositeCount += 1;
  }
  const oscillationRatio =
    candles.length > 0 ? oppositeCount / candles.length : 0;

  const qualityScore = Math.round((1 - netToRangeRatio) * 100) / 100;

  if (Math.abs(recomputedRangePips - (row.asian_range_pips ?? 0)) > 2) {
    console.warn(`WARN: range mismatch on ${row.trade_date}`);
    return null;
  }

  const flat_current = netToRangeRatio <= 0.5 || oscillationRatio >= 0.3;
  const flat_A = netToRangeRatio <= 0.5 && oscillationRatio >= 0.3;
  const flat_B = netToRangeRatio <= 0.55 && oscillationRatio >= 0.25;
  const flat_C = netToRangeRatio <= 0.5 && oscillationRatio >= 0.3;

  return {
    trade_date: row.trade_date,
    amd_outcome_tag: row.amd_outcome_tag,
    recomputedRangePips,
    netPips,
    netToRangeRatio,
    oscillationRatio,
    qualityScore,
    flat_current,
    flat_A,
    flat_B,
    flat_C,
    tag_current: resolveSimulatedLiveTag(recomputedRangePips, flat_current, 35),
    tag_A: resolveSimulatedLiveTag(recomputedRangePips, flat_A, 35),
    tag_B: resolveSimulatedLiveTag(recomputedRangePips, flat_B, 35),
    tag_C: resolveSimulatedLiveTag(recomputedRangePips, flat_C, 43),
  };
}

function updateVariantMetrics(
  metrics: VariantMetrics,
  simulatedTag: SimulatedTag,
  outcomeTag: string,
  isFlat: boolean,
): void {
  if (isFlat) metrics.flatCount += 1;

  if (simulatedTag !== 'AMD_FAILED') return;

  if (REAL_AMD_OUTCOMES.has(outcomeTag)) {
    metrics.correct += 1;
    return;
  }
  if (outcomeTag === 'AMD_SHIFTED' || outcomeTag === 'AMD_NONE') {
    metrics.falseAmd += 1;
  }
}

function updateMissedMetrics(
  metrics: VariantMetrics,
  simulatedTag: SimulatedTag,
  outcomeTag: string,
): void {
  if (
    simulatedTag === 'AMD_SHIFTED' &&
    MISSED_AMD_OUTCOMES.has(outcomeTag)
  ) {
    metrics.missedAmd += 1;
  }
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatMetricsRow(label: string, metrics: VariantMetrics): string {
  const precisionDenom = metrics.correct + metrics.falseAmd;
  const recallDenom = metrics.correct + metrics.missedAmd;
  return [
    label.padEnd(12),
    String(metrics.correct).padStart(7),
    String(metrics.falseAmd).padStart(9),
    String(metrics.missedAmd).padStart(10),
    pct(metrics.correct, precisionDenom).padStart(10),
    pct(metrics.correct, recallDenom).padStart(8),
  ].join('  ');
}

async function loadRows(): Promise<AmdAccumulationRow[]> {
  const supabase = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );

  const { data, error } = await supabase
    .from('amd_state')
    .select(`
      trade_date, amd_tag, amd_outcome_tag,
      asian_range_pips, asian_net_pips, asian_is_flat,
      asian_close_position_pct,
      judas_direction, judas_pips,
      reversal_confirmed, compression_breakout,
      chart_data,
      daily_bias_alignment, layer4_bullish_count
    `)
    .not('amd_outcome_tag', 'is', null)
    .not('chart_data', 'is', null)
    .order('trade_date', { ascending: true });

  if (error) throw new Error(`amd_state query failed: ${error.message}`);
  return (data ?? []) as AmdAccumulationRow[];
}

function writeChangedDaysCsv(
  rows: ComputedAccumulationRow[],
  outputPath: string,
): void {
  const header =
    'trade_date,range_pips,net_to_range,oscillation,quality,tag_current,tag_A,tag_B,tag_C,outcome';
  const lines = rows.map((row) =>
    [
      row.trade_date,
      row.recomputedRangePips,
      row.netToRangeRatio.toFixed(3),
      row.oscillationRatio.toFixed(3),
      row.qualityScore.toFixed(2),
      row.tag_current,
      row.tag_A,
      row.tag_B,
      row.tag_C,
      row.amd_outcome_tag,
    ].join(','),
  );
  fs.writeFileSync(outputPath, [header, ...lines].join('\n'), 'utf8');
}

async function main(): Promise<void> {
  const sourceRows = await loadRows();
  const computed: ComputedAccumulationRow[] = [];
  let skipped = 0;

  for (const row of sourceRows) {
    const result = computeRowFromChart(row);
    if (!result) {
      skipped += 1;
      continue;
    }
    computed.push(result);
  }

  const metrics: Record<VariantKey, VariantMetrics> = {
    current: { flatCount: 0, correct: 0, falseAmd: 0, missedAmd: 0 },
    A: { flatCount: 0, correct: 0, falseAmd: 0, missedAmd: 0 },
    B: { flatCount: 0, correct: 0, falseAmd: 0, missedAmd: 0 },
    C: { flatCount: 0, correct: 0, falseAmd: 0, missedAmd: 0 },
  };

  for (const row of computed) {
    updateVariantMetrics(metrics.current, row.tag_current, row.amd_outcome_tag, row.flat_current);
    updateVariantMetrics(metrics.A, row.tag_A, row.amd_outcome_tag, row.flat_A);
    updateVariantMetrics(metrics.B, row.tag_B, row.amd_outcome_tag, row.flat_B);
    updateVariantMetrics(metrics.C, row.tag_C, row.amd_outcome_tag, row.flat_C);

    updateMissedMetrics(metrics.current, row.tag_current, row.amd_outcome_tag);
    updateMissedMetrics(metrics.A, row.tag_A, row.amd_outcome_tag);
    updateMissedMetrics(metrics.B, row.tag_B, row.amd_outcome_tag);
    updateMissedMetrics(metrics.C, row.tag_C, row.amd_outcome_tag);
  }

  const qualityByOutcome = new Map<string, number[]>();
  for (const row of computed) {
    const bucket = qualityByOutcome.get(row.amd_outcome_tag) ?? [];
    bucket.push(row.qualityScore);
    qualityByOutcome.set(row.amd_outcome_tag, bucket);
  }

  const changedRows = computed.filter(
    (row) =>
      row.tag_A !== row.tag_current ||
      row.tag_B !== row.tag_current ||
      row.tag_C !== row.tag_current,
  );

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, `amd_accumulation_backtest_${stamp}.csv`);
  writeChangedDaysCsv(changedRows, csvPath);

  console.log('=== AMD ACCUMULATION LOGIC BACKTEST ===');
  console.log(`Rows analyzed: ${computed.length}  |  Skipped (range mismatch): ${skipped}`);
  console.log('');
  console.log('FLAT DAYS COUNT:');
  console.log(`  Current (OR):              ${metrics.current.flatCount} days flat`);
  console.log(
    `  Variant A (AND strict):      ${metrics.A.flatCount} days flat  (delta: ${metrics.A.flatCount - metrics.current.flatCount >= 0 ? '+' : ''}${metrics.A.flatCount - metrics.current.flatCount})`,
  );
  console.log(
    `  Variant B (AND relaxed):     ${metrics.B.flatCount} days flat  (delta: ${metrics.B.flatCount - metrics.current.flatCount >= 0 ? '+' : ''}${metrics.B.flatCount - metrics.current.flatCount})`,
  );
  console.log(
    `  Variant C (AND + range43):   ${metrics.C.flatCount} days flat  (delta: ${metrics.C.flatCount - metrics.current.flatCount >= 0 ? '+' : ''}${metrics.C.flatCount - metrics.current.flatCount})`,
  );
  console.log('');
  console.log('ACCURACY — AMD_FAILED tag → real AMD outcome:');
  console.log('             Correct  FalseAMD  MissedAMD  Precision  Recall');
  console.log(formatMetricsRow('Current:', metrics.current));
  console.log(formatMetricsRow('Variant A:', metrics.A));
  console.log(formatMetricsRow('Variant B:', metrics.B));
  console.log(formatMetricsRow('Variant C:', metrics.C));
  console.log('');
  console.log('QUALITY SCORE by outcome tag (Variant D — no logic change):');
  for (const tag of [
    'AMD_TEXTBOOK',
    'AMD_COMPRESSION_BREAKOUT',
    'AMD_FAILED',
    'AMD_SHIFTED',
    'AMD_NONE',
  ]) {
    const scores = qualityByOutcome.get(tag) ?? [];
    const avg = scores.length > 0 ? average(scores) : 0;
    const med = scores.length > 0 ? median(scores) : 0;
    console.log(
      `  ${tag.padEnd(26)} avg=${avg.toFixed(2)}  median=${med.toFixed(2)}  (n=${scores.length})`,
    );
  }
  console.log('');
  console.log('CHANGED DAYS — where any variant differs from current:');
  console.log('  DATE       | range | ntr   | osc   | qual | current | A | B | C | outcome');
  for (const row of changedRows) {
    console.log(
      `  ${row.trade_date} | ${String(row.recomputedRangePips).padStart(5)} | ${row.netToRangeRatio.toFixed(3)} | ${row.oscillationRatio.toFixed(3)} | ${row.qualityScore.toFixed(2)} | ${row.tag_current} | ${row.tag_A} | ${row.tag_B} | ${row.tag_C} | ${row.amd_outcome_tag}`,
    );
  }
  console.log('');
  console.log(`CSV: ${path.relative(process.cwd(), csvPath)}`);
}

main().catch((err: unknown) => {
  console.error('[AmdAccumulationBacktest] Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
