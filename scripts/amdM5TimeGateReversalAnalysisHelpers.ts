import * as fs from 'fs';
import * as path from 'path';

type ReversalHit = {
  threshold: number;
  hit: boolean;
  bar_index: number | null;
  peak_before_reversal_pips: number | null;
};

type TimeGateDayResult = {
  trade_date: string;
  amd_tag: string;
  predicted_direction: 'UP' | 'DOWN';
  daily_bias_alignment: string;
  judas_direction: string;
  reversal_confirmed: string;
  asian_range_bucket: string;
  asian_range_pips: number | null;
  entry_hour: number;
  exit_hour: number;
  reference_price: number;
  bars_in_gate: number;
  mfe_pips: number;
  mfe_bar_index: number;
  mfe_hour: number;
  mae_pips: number;
  mae_bar_index: number;
  mae_hour: number;
  close_pips: number;
  giveback_to_close_pips: number;
  max_giveback_from_peak_pips: number;
  reversals: ReversalHit[];
};

export type TimeGateSummaryRow = {
  group_type: string;
  group_value: string;
  amd_tag: string;
  n_days: number;
  avg_mfe_pips: number;
  p50_mfe_pips: number;
  p75_mfe_pips: number;
  mfe_stddev: number;
  positive_mfe_count: number;
  positive_mfe_pct: number;
  avg_mae_pips: number;
  avg_close_pips: number;
  avg_giveback_to_close_pips: number;
  avg_max_giveback_from_peak_pips: number;
  avg_mfe_bar_index: number;
  avg_mfe_hour: number;
  reversal_stats: Record<string, {
    pct_hit: number;
    avg_bar_index: number;
    avg_peak_before_reversal_pips: number;
  }>;
};

type RuntimeParameters = {
  scriptVersion: string;
  startDate: string | null;
  endDate: string | null;
  entryHours: Record<string, number>;
  exitHours: Record<string, number>;
  reversalThresholds: readonly number[];
  pipMultiplier: number;
  useConservativeReversal: boolean;
};

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * pct)];
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const average = avg(values);
  const variance = avg(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance);
}

function summarize(
  groupType: string,
  groupValue: string,
  tag: string,
  rows: TimeGateDayResult[],
  reversalThresholds: readonly number[],
): TimeGateSummaryRow {
  const reversalStats: TimeGateSummaryRow['reversal_stats'] = {};
  for (const threshold of reversalThresholds) {
    const matching = rows.map((row) => row.reversals.find((hit) => hit.threshold === threshold));
    const hitRows = matching.filter((hit): hit is ReversalHit => Boolean(hit?.hit));
    reversalStats[String(threshold)] = {
      pct_hit: parseFloat(((hitRows.length / rows.length) * 100).toFixed(1)),
      avg_bar_index: parseFloat(avg(hitRows.map((hit) => hit.bar_index ?? 0)).toFixed(1)),
      avg_peak_before_reversal_pips: parseFloat(
        avg(hitRows.map((hit) => hit.peak_before_reversal_pips ?? 0)).toFixed(2),
      ),
    };
  }
  const mfeValues = rows.map((row) => row.mfe_pips);
  const positiveMfeCount = rows.filter((row) => row.mfe_pips > 0).length;
  return {
    group_type: groupType,
    group_value: groupValue,
    amd_tag: tag,
    n_days: rows.length,
    avg_mfe_pips: parseFloat(avg(mfeValues).toFixed(2)),
    p50_mfe_pips: parseFloat(percentile(mfeValues, 0.5).toFixed(2)),
    p75_mfe_pips: parseFloat(percentile(mfeValues, 0.75).toFixed(2)),
    mfe_stddev: parseFloat(stddev(mfeValues).toFixed(2)),
    positive_mfe_count: positiveMfeCount,
    positive_mfe_pct: parseFloat(((positiveMfeCount / rows.length) * 100).toFixed(1)),
    avg_mae_pips: parseFloat(avg(rows.map((row) => row.mae_pips)).toFixed(2)),
    avg_close_pips: parseFloat(avg(rows.map((row) => row.close_pips)).toFixed(2)),
    avg_giveback_to_close_pips: parseFloat(
      avg(rows.map((row) => row.giveback_to_close_pips)).toFixed(2),
    ),
    avg_max_giveback_from_peak_pips: parseFloat(
      avg(rows.map((row) => row.max_giveback_from_peak_pips)).toFixed(2),
    ),
    avg_mfe_bar_index: parseFloat(avg(rows.map((row) => row.mfe_bar_index)).toFixed(1)),
    avg_mfe_hour: parseFloat(avg(rows.map((row) => row.mfe_hour)).toFixed(1)),
    reversal_stats: reversalStats,
  };
}

export function buildSummaries(
  results: TimeGateDayResult[],
  tagsToAnalyze: readonly string[],
  reversalThresholds: readonly number[],
): TimeGateSummaryRow[] {
  const summaries: TimeGateSummaryRow[] = [];
  const dimensions: Array<[string, (row: TimeGateDayResult) => string]> = [
    ['ALL', () => 'ALL'],
    ['daily_bias_alignment', (row) => row.daily_bias_alignment],
    ['judas_direction', (row) => row.judas_direction],
    ['reversal_confirmed', (row) => row.reversal_confirmed],
    ['asian_range_bucket', (row) => row.asian_range_bucket],
  ];
  for (const tag of tagsToAnalyze) {
    const tagRows = results.filter((row) => row.amd_tag === tag);
    for (const [groupType, getGroup] of dimensions) {
      const groupValues = [...new Set(tagRows.map(getGroup))].sort();
      for (const groupValue of groupValues) {
        const rows = tagRows.filter((row) => getGroup(row) === groupValue);
        if (rows.length > 0) summaries.push(summarize(groupType, groupValue, tag, rows, reversalThresholds));
      }
    }
  }
  return summaries;
}

export function printRuntimeParameters(params: RuntimeParameters): void {
  console.log('--- Runtime Parameters ---');
  console.log(`Script: amdM5TimeGateReversalAnalysis.ts`);
  console.log(`Version: ${params.scriptVersion}`);
  console.log(`Date range: ${params.startDate && params.endDate ? `${params.startDate} to ${params.endDate}` : 'ALL'}`);
  console.log('Time gates:');
  for (const tag of Object.keys(params.entryHours)) {
    console.log(`  ${tag}: ${params.entryHours[tag]}-${params.exitHours[tag]} UTC`);
  }
  console.log(`Reversal pip levels: ${params.reversalThresholds.join(', ')}`);
  console.log(`Pip multiplier: ${params.pipMultiplier}`);
  console.log(`USE_CONSERVATIVE_REVERSAL: ${params.useConservativeReversal}`);
  console.log('');
}

export function printSummary(summaries: TimeGateSummaryRow[]): void {
  console.log('=== AMD M5 TIME-GATE REVERSAL ANALYSIS ===');
  console.log('Reference: entry-hour M5 open, direction: predicted AMD direction');
  console.log('Reversal: running MFE giveback using adverse M5 extreme, thresholds in pips');
  console.log('');
  const allRows = summaries.filter((entry) => entry.group_type === 'ALL');
  for (const row of allRows) {
    const rev5 = row.reversal_stats['5'];
    const rev10 = row.reversal_stats['10'];
    console.log(
      `${row.amd_tag} n=${row.n_days} | MFE avg=${row.avg_mfe_pips} p50=${row.p50_mfe_pips} p75=${row.p75_mfe_pips} std=${row.mfe_stddev} pos=${row.positive_mfe_count}/${row.positive_mfe_pct}% | ` +
      `MAE avg=${row.avg_mae_pips} | close=${row.avg_close_pips} | giveback=${row.avg_giveback_to_close_pips} | ` +
      `rev5=${rev5.pct_hit}% @bar ${rev5.avg_bar_index} | rev10=${rev10.pct_hit}% @bar ${rev10.avg_bar_index}`,
    );
  }
  const compression = allRows.find((row) => row.amd_tag === 'AMD_COMPRESSION_BREAKOUT');
  const textbook = allRows.find((row) => row.amd_tag === 'AMD_TEXTBOOK');
  const failed = allRows.find((row) => row.amd_tag === 'AMD_FAILED');
  if (compression && textbook && failed) {
    console.log('\n--- Comparison Section ---');
    console.log(`COMPRESSION_BREAKOUT - FAILED avg MFE: ${(compression.avg_mfe_pips - failed.avg_mfe_pips).toFixed(2)}p`);
    console.log(`TEXTBOOK - FAILED avg MFE: ${(textbook.avg_mfe_pips - failed.avg_mfe_pips).toFixed(2)}p`);
  }
}

function writeMonthlyCsv(
  outDir: string,
  results: TimeGateDayResult[],
  reversalThresholds: readonly number[],
): void {
  const monthlyPath = path.join(outDir, 'amd_m5_time_gate_reversal_monthly.csv');
  const months = [...new Set(results.map((row) => row.trade_date.slice(0, 7)))].sort();
  const lines = ['month,n_days,avg_mfe_pips,rev5_hit_pct'];
  for (const month of months) {
    const rows = results.filter((row) => row.trade_date.startsWith(month));
    const rev5Hits = rows.filter((row) => row.reversals.find((hit) => hit.threshold === 5)?.hit).length;
    lines.push([
      month,
      rows.length,
      parseFloat(avg(rows.map((row) => row.mfe_pips)).toFixed(2)),
      parseFloat(((rev5Hits / rows.length) * 100).toFixed(1)),
    ].join(','));
  }
  fs.writeFileSync(monthlyPath, lines.join('\n'), 'utf8');
  console.log(`[Output] ${monthlyPath}`);
}

export function writeCsvs(
  results: TimeGateDayResult[],
  summaries: TimeGateSummaryRow[],
  reversalThresholds: readonly number[],
  shouldWriteMonthlyCsv: boolean,
): void {
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const dayPath = path.join(outDir, 'amd_m5_time_gate_reversal_by_day.csv');
  const summaryPath = path.join(outDir, 'amd_m5_time_gate_reversal_summary.csv');
  const dayHeader = [
    'trade_date', 'amd_tag', 'predicted_direction', 'daily_bias_alignment',
    'judas_direction', 'reversal_confirmed', 'asian_range_bucket',
    'asian_range_pips', 'entry_hour', 'exit_hour', 'bars_in_gate',
    'reference_price', 'mfe_pips', 'mfe_bar_index', 'mfe_hour',
    'mae_pips', 'mae_bar_index', 'mae_hour', 'close_pips',
    'giveback_to_close_pips', 'max_giveback_from_peak_pips',
    ...reversalThresholds.flatMap((threshold) => [
      `rev_${threshold}_hit`, `rev_${threshold}_bar`, `rev_${threshold}_peak_before`,
    ]),
  ];
  const dayLines = [dayHeader.join(',')];
  for (const row of results) {
    dayLines.push([
      row.trade_date, row.amd_tag, row.predicted_direction, row.daily_bias_alignment,
      row.judas_direction, row.reversal_confirmed, row.asian_range_bucket,
      row.asian_range_pips ?? '', row.entry_hour, row.exit_hour, row.bars_in_gate,
      row.reference_price, row.mfe_pips, row.mfe_bar_index, row.mfe_hour,
      row.mae_pips, row.mae_bar_index, row.mae_hour, row.close_pips,
      row.giveback_to_close_pips, row.max_giveback_from_peak_pips,
      ...reversalThresholds.flatMap((threshold) => {
        const hit = row.reversals.find((entry) => entry.threshold === threshold);
        return [hit?.hit ?? false, hit?.bar_index ?? '', hit?.peak_before_reversal_pips ?? ''];
      }),
    ].join(','));
  }
  fs.writeFileSync(dayPath, dayLines.join('\n'), 'utf8');
  const summaryHeader = [
    'group_type', 'group_value', 'amd_tag', 'n_days', 'avg_mfe_pips',
    'p50_mfe_pips', 'p75_mfe_pips', 'mfe_stddev', 'positive_mfe_count',
    'positive_mfe_pct', 'avg_mae_pips', 'avg_close_pips',
    'avg_giveback_to_close_pips', 'avg_max_giveback_from_peak_pips',
    'avg_mfe_bar_index', 'avg_mfe_hour',
    ...reversalThresholds.flatMap((threshold) => [
      `rev_${threshold}_pct_hit`, `rev_${threshold}_avg_bar`, `rev_${threshold}_avg_peak_before`,
    ]),
  ];
  const summaryLines = [summaryHeader.join(',')];
  for (const row of summaries) {
    summaryLines.push([
      row.group_type, row.group_value, row.amd_tag, row.n_days,
      row.avg_mfe_pips, row.p50_mfe_pips, row.p75_mfe_pips, row.mfe_stddev,
      row.positive_mfe_count, row.positive_mfe_pct, row.avg_mae_pips,
      row.avg_close_pips, row.avg_giveback_to_close_pips,
      row.avg_max_giveback_from_peak_pips, row.avg_mfe_bar_index, row.avg_mfe_hour,
      ...reversalThresholds.flatMap((threshold) => {
        const stats = row.reversal_stats[String(threshold)];
        return [stats.pct_hit, stats.avg_bar_index, stats.avg_peak_before_reversal_pips];
      }),
    ].join(','));
  }
  fs.writeFileSync(summaryPath, summaryLines.join('\n'), 'utf8');
  console.log(`[Output] ${dayPath}`);
  console.log(`[Output] ${summaryPath}`);
  if (shouldWriteMonthlyCsv) writeMonthlyCsv(outDir, results, reversalThresholds);
}
