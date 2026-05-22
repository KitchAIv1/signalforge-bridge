/**
 * AMD Asian-range threshold sensitivity — amd_state only (no OANDA).
 * Run: npx ts-node scripts/amdAsianRangeThresholdBacktest.ts
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { csvEscape } from './amdBackfillCsv';
import { printAsianRangeThresholdReport } from './amdAsianRangeThresholdReport';

dotenv.config();

const INSTRUMENT = 'AUD_USD';
const THRESHOLDS = [25, 30, 35, 40, 45, 50] as const;

/** Row shape from Supabase (subset). */
type AmdStateDbRow = {
  trade_date: string;
  amd_tag: string;
  daily_bias_alignment: string | null;
  layer4_d1_bias: string | null;
  judas_direction: string | null;
  judas_pips: number | null;
  asian_range_pips: number | null;
  asian_is_flat: boolean | null;
  reversal_confirmed: boolean | null;
  compression_breakout: boolean | null;
  chart_data: Record<string, unknown> | null;
};

type ChartOhlcEntry = {
  time: string;
  o: string;
  h: string;
  l: string;
  c: string;
};

type OutputRow = {
  trade_date: string;
  amd_tag: string;
  asian_range_pips: number;
  asian_is_flat: boolean | null;
  daily_bias_alignment: string;
  judas_direction: string;
  reversal_confirmed: string;
  predicted_direction: string;
  distribution_direction: string;
  alignment_correct: string;
  tag_at_25: string;
  tag_at_30: string;
  tag_at_35: string;
  tag_at_40: string;
  tag_at_45: string;
  tag_at_50: string;
};

/** Extra fields computed for summaries; not written to CSV. */
type ProcessedEnvelope = OutputRow & {
  distribution_pips: number;
  judas_direction_raw: string | null;
  layer4_d1_bias_raw: string | null;
};

function buildSupabaseClient(): ReturnType<typeof createClient> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[AsianRange] Missing SUPABASE_URL or service key env var');
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

type PredictMicroInput = {
  amd_tag: string;
  judas_direction: string | null;
  layer4_d1_bias: string | null;
};

/** Exact logic from amdMicroBacktest.ts `computePredictedDirection`. */
function computePredictedDirection(row: PredictMicroInput): string {
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

/** Exact logic from amdMicroBacktest.ts `isCorrect`. */
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

/**
 * Mirrors `resolveAmdTag` thresholds with variable lower bound (`threshold`);
 * excludes `delayed_distribution` / AMD_DELAYED as specified in task.
 */
function resolveTagAtThreshold(
  asian_range_pips: number,
  asian_is_flat: boolean | null,
  reversal_confirmed: boolean | null,
  judas_pips: number | null,
  compression_breakout: boolean,
  threshold: number,
): string {
  if (asian_range_pips < threshold) {
    if (asian_is_flat === true) {
      if (reversal_confirmed === true && (judas_pips ?? 0) >= 8) {
        return 'AMD_TEXTBOOK';
      }
      if (compression_breakout && !reversal_confirmed) {
        return 'AMD_COMPRESSION_BREAKOUT';
      }
      if (reversal_confirmed === null) return 'AMD_PARTIAL';
      return 'AMD_FAILED';
    }
    return 'AMD_SHIFTED';
  }
  if (asian_range_pips < 50) return 'AMD_SHIFTED';
  return 'AMD_NONE';
}

const CSV_COLUMNS: Array<keyof OutputRow> = [
  'trade_date',
  'amd_tag',
  'asian_range_pips',
  'asian_is_flat',
  'daily_bias_alignment',
  'judas_direction',
  'reversal_confirmed',
  'predicted_direction',
  'distribution_direction',
  'alignment_correct',
  'tag_at_25',
  'tag_at_30',
  'tag_at_35',
  'tag_at_40',
  'tag_at_45',
  'tag_at_50',
];

function writeCsv(rows: OutputRow[]): void {
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, 'amd_asian_range_threshold_backtest.csv');

  const lines = [CSV_COLUMNS.join(',')];
  for (const recordRow of rows) {
    lines.push(
      CSV_COLUMNS.map((columnKey) => {
        const cellValue = recordRow[columnKey];
        if (
          columnKey === 'asian_is_flat' &&
          (cellValue === null || cellValue === undefined)
        ) {
          return csvEscape('null');
        }
        return csvEscape(cellValue as string | number | boolean | null);
      }).join(','),
    );
  }
  fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
  console.log(`\n[AsianRange] CSV written: ${csvPath}`);
}

function buildSyntheticTags(
  asian_range_pips: number,
  raw: AmdStateDbRow,
): Record<number, string> {
  const compressFlag = raw.compression_breakout === true;
  const syntheticByThreshold: Partial<Record<(typeof THRESHOLDS)[number], string>> = {};
  for (const threshold of THRESHOLDS) {
    syntheticByThreshold[threshold] = resolveTagAtThreshold(
      asian_range_pips,
      raw.asian_is_flat,
      raw.reversal_confirmed,
      raw.judas_pips,
      compressFlag,
      threshold,
    );
  }
  return syntheticByThreshold as Record<number, string>;
}

function baseOutputRow(
  raw: AmdStateDbRow,
  predicted: string,
  distribution_direction: string,
  alignment_correct: string,
  metricsPips: number,
  synth: Record<number, string>,
): ProcessedEnvelope {
  const core: OutputRow = {
    trade_date: raw.trade_date,
    amd_tag: raw.amd_tag,
    asian_range_pips: raw.asian_range_pips ?? 0,
    asian_is_flat: raw.asian_is_flat,
    daily_bias_alignment: raw.daily_bias_alignment ?? 'null',
    judas_direction: raw.judas_direction ?? 'null',
    reversal_confirmed: String(raw.reversal_confirmed ?? 'null'),
    predicted_direction: predicted,
    distribution_direction,
    alignment_correct,
    tag_at_25: synth[25],
    tag_at_30: synth[30],
    tag_at_35: synth[35],
    tag_at_40: synth[40],
    tag_at_45: synth[45],
    tag_at_50: synth[50],
  };
  return {
    ...core,
    distribution_pips: metricsPips,
    judas_direction_raw: raw.judas_direction,
    layer4_d1_bias_raw: raw.layer4_d1_bias,
  };
}

function processDbRow(raw: AmdStateDbRow): ProcessedEnvelope | null {
  if (!raw.chart_data || raw.asian_range_pips === null) return null;

  const chartObj =
    raw.chart_data && typeof raw.chart_data === 'object'
      ? raw.chart_data
      : null;
  if (!chartObj) return null;

  const ohlc = readOhlcFromChart(chartObj);
  if (ohlc.length === 0) return null;

  const distributionCandles = filterDistributionCandles(ohlc);
  if (distributionCandles.length < 2) return null;

  const metrics = computeDistributionMetrics(distributionCandles);
  const predictionInput: PredictMicroInput = {
    amd_tag: raw.amd_tag,
    judas_direction: raw.judas_direction,
    layer4_d1_bias: raw.layer4_d1_bias,
  };
  const predicted = computePredictedDirection(predictionInput);

  const alignment_correct = isCorrect(predicted, metrics.distribution_direction);
  const syntheticTags = buildSyntheticTags(raw.asian_range_pips, raw);

  return baseOutputRow(
    raw,
    predicted,
    metrics.distribution_direction,
    alignment_correct,
    metrics.distribution_pips,
    syntheticTags,
  );
}

async function main(): Promise<void> {
  const supabase = buildSupabaseClient();

  const { data, error } = await supabase
    .from('amd_state')
    .select(
      `
      trade_date,
      amd_tag,
      daily_bias_alignment,
      layer4_d1_bias,
      judas_direction,
      judas_pips,
      asian_range_pips,
      asian_is_flat,
      reversal_confirmed,
      compression_breakout,
      chart_data
    `,
    )
    .eq('pair', INSTRUMENT)
    .order('trade_date', { ascending: true });

  if (error) {
    throw new Error(`[AsianRange] Supabase query failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error('[AsianRange] No rows returned');
  }

  console.log(`[AsianRange] Loaded ${data.length} rows from amd_state`);

  const processedEnvelopes: ProcessedEnvelope[] = [];
  let skipped = 0;

  for (const rawUntyped of data) {
    const row = rawUntyped as unknown as AmdStateDbRow;
    const processed = processDbRow(row);
    if (!processed) {
      skipped++;
      continue;
    }
    processedEnvelopes.push(processed);
  }

  console.log(`[AsianRange] Processed: ${processedEnvelopes.length} | Skipped: ${skipped}`);

  writeCsv(processedEnvelopes);
  printAsianRangeThresholdReport(data.length, skipped, processedEnvelopes);
}

void main()
  .then(() => process.exit(0))
  .catch((runErr: unknown) => {
    console.error('[AsianRange] Fatal:', runErr);
    process.exit(1);
  });
