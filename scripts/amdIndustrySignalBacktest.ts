/**
 * Industry signal backtest — intraday momentum, Judas quality, NY reversal.
 * READ-ONLY research — amd_m5_distribution_candles + ground truth CSV.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amdIndustrySignalBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';
type Dir = 'UP' | 'DOWN';
type FlatDir = Dir | 'FLAT';
type M5RawCandle = { o: string; h: string; l: string; c: string; time?: string };

type WindowAgg = {
  open: number;
  close: number;
  high: number;
  low: number;
  net_pips: number;
  up_pips: number;
  down_pips: number;
  net_dir: FlatDir;
  dom_dir: FlatDir;
};

type DayResult = {
  trade_date: string;
  amd_outcome_tag: string;
  amd_tag: string;
  judas_direction: string;
  judas_pips: number;
  w1030_1100_net_pips: number;
  w1030_1100_net_dir: FlatDir;
  w1030_1100_dom_dir: FlatDir;
  w1030_1200_net_pips: number;
  w1030_1200_net_dir: FlatDir;
  w1030_1200_dom_dir: FlatDir;
  w1230_1300_dom_dir: FlatDir;
  w1200_1300_dom_dir: FlatDir;
  w1200_1300_net_dir: FlatDir;
  sigA_prediction: Dir | null;
  sigA_vs_1230: boolean | null;
  sigA_vs_1200: boolean | null;
  sigB_8p: Dir | null;
  sigB_10p: Dir | null;
  sigB_12p: Dir | null;
  sigB_15p: Dir | null;
  sigB10_vs_1230: boolean | null;
  sigB10_vs_1200: boolean | null;
  sigC_prediction: Dir | null;
  sigC_dom_prediction: Dir | null;
  sigC_vs_1230: boolean | null;
  sigC_vs_1200: boolean | null;
  sigC_dom_vs_1230: boolean | null;
  sigC_dom_vs_1200: boolean | null;
  sigAC_agree: Dir | null;
  sigBC_agree: Dir | null;
  sigABC_agree: Dir | null;
  sigAC_vs_1230: boolean | null;
  sigBC_vs_1230: boolean | null;
  sigABC_vs_1230: boolean | null;
  sigAC_vs_1200: boolean | null;
  sigBC_vs_1200: boolean | null;
  sigABC_vs_1200: boolean | null;
  judas_vs_1230: boolean | null;
  judas_vs_1200: boolean | null;
};

type AccuracyStats = {
  n_signal: number;
  n_valid: number;
  correct: number;
  accuracy: number;
};

const OUTCOME_TAGS = [
  'AMD_TEXTBOOK',
  'AMD_COMPRESSION_BREAKOUT',
  'AMD_FAILED',
  'AMD_SHIFTED',
  'AMD_NONE',
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (name === 'SUPABASE_SERVICE_ROLE_KEY' && process.env.SUPABASE_SERVICE_KEY) {
    return process.env.SUPABASE_SERVICE_KEY;
  }
  throw new Error(`Missing env: ${name}`);
}

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function loadGroundTruthCsv(): {
  csvByDate: Map<string, string[]>;
  col: (row: string[], name: string) => string;
} {
  const csvPath = path.join(__dirname, 'output/amd_1200_slot_ground_truth_20260605.csv');
  const csvLines = fs.readFileSync(csvPath, 'utf8').split('\n');
  const csvHeader = csvLines[0].split(',');
  const csvRows = csvLines.slice(1).filter(Boolean).map((line) => line.split(','));
  const csvByDate = new Map<string, string[]>();
  csvRows.forEach((row) => csvByDate.set(row[csvHeader.indexOf('trade_date')], row));
  const col = (row: string[], name: string) => row[csvHeader.indexOf(name)] ?? '';
  return { csvByDate, col };
}

function aggregateWindow(
  candles: M5RawCandle[],
  startIdx: number,
  endIdx: number,
): WindowAgg | null {
  const slice = candles.slice(startIdx, endIdx);
  if (slice.length === 0) return null;

  const open = parseFloat(slice[0].o);
  const close = parseFloat(slice[slice.length - 1].c);
  const high = Math.max(...slice.map((c) => parseFloat(c.h)));
  const low = Math.min(...slice.map((c) => parseFloat(c.l)));

  const netPips = Math.round((close - open) * 10000 * 10) / 10;
  const upPips = Math.round((high - open) * 10000 * 10) / 10;
  const downPips = Math.round((open - low) * 10000 * 10) / 10;

  const netDir: FlatDir = netPips > 1 ? 'UP' : netPips < -1 ? 'DOWN' : 'FLAT';
  const domDir: FlatDir = upPips > downPips + 0.5 ? 'UP'
    : downPips > upPips + 0.5 ? 'DOWN' : 'FLAT';

  return {
    open, close, high, low,
    net_pips: netPips,
    up_pips: upPips,
    down_pips: downPips,
    net_dir: netDir,
    dom_dir: domDir,
  };
}

function isCorrect(prediction: FlatDir | null, actual: FlatDir): boolean | null {
  if (!prediction || actual === 'FLAT') return null;
  return prediction === actual;
}

function judasInverted(judasDirection: string): Dir | null {
  if (judasDirection === 'UP') return 'DOWN';
  if (judasDirection === 'DOWN') return 'UP';
  return null;
}

function computeAccuracy(
  rows: DayResult[],
  getResult: (row: DayResult) => boolean | null,
  getSignal: (row: DayResult) => FlatDir | null,
): AccuracyStats {
  const withSignal = rows.filter((row) => getSignal(row) !== null);
  const valid = withSignal.filter((row) => getResult(row) !== null);
  const correct = valid.filter((row) => getResult(row) === true);
  return {
    n_signal: withSignal.length,
    n_valid: valid.length,
    correct: correct.length,
    accuracy: valid.length > 0
      ? Math.round((correct.length / valid.length) * 1000) / 10
      : 0,
  };
}

function buildDayResult(
  tradeDate: string,
  csvRow: string[],
  candles: M5RawCandle[],
  col: (row: string[], name: string) => string,
): DayResult | null {
  const w1030_1100 = aggregateWindow(candles, 6, 12);
  const w1030_1200 = aggregateWindow(candles, 6, 24);
  const w1230_1300 = aggregateWindow(candles, 30, 36);
  const w1200_1300 = aggregateWindow(candles, 24, 36);
  if (!w1030_1100 || !w1030_1200 || !w1230_1300 || !w1200_1300) return null;

  const judasDirection = col(csvRow, 'judas_direction');
  const judasPips = parseFloat(col(csvRow, 'judas_pips')) || 0;
  const inverted = judasInverted(judasDirection);

  const sigA = w1030_1100.net_dir !== 'FLAT' ? w1030_1100.net_dir : null;
  const sigB8 = judasPips >= 8 && inverted !== null ? inverted : null;
  const sigB10 = judasPips >= 10 && inverted !== null ? inverted : null;
  const sigB12 = judasPips >= 12 && inverted !== null ? inverted : null;
  const sigB15 = judasPips >= 15 && inverted !== null ? inverted : null;
  const sigC = w1030_1200.net_dir !== 'FLAT'
    ? (w1030_1200.net_dir === 'UP' ? 'DOWN' : 'UP')
    : null;
  const sigCDom = w1030_1200.dom_dir !== 'FLAT'
    ? (w1030_1200.dom_dir === 'UP' ? 'DOWN' : 'UP')
    : null;

  const target1230 = w1230_1300.dom_dir;
  const target1200 = w1200_1300.dom_dir;

  const sigAC = sigA !== null && sigC !== null && sigA === sigC ? sigA : null;
  const sigBC = sigB10 !== null && sigC !== null && sigB10 === sigC ? sigB10 : null;
  const sigABC = sigA !== null && sigB10 !== null && sigC !== null
    && sigA === sigB10 && sigB10 === sigC
    ? sigA
    : null;

  return {
    trade_date: tradeDate,
    amd_outcome_tag: col(csvRow, 'amd_outcome_tag'),
    amd_tag: col(csvRow, 'amd_tag'),
    judas_direction: judasDirection,
    judas_pips: judasPips,
    w1030_1100_net_pips: w1030_1100.net_pips,
    w1030_1100_net_dir: w1030_1100.net_dir,
    w1030_1100_dom_dir: w1030_1100.dom_dir,
    w1030_1200_net_pips: w1030_1200.net_pips,
    w1030_1200_net_dir: w1030_1200.net_dir,
    w1030_1200_dom_dir: w1030_1200.dom_dir,
    w1230_1300_dom_dir: target1230,
    w1200_1300_dom_dir: target1200,
    w1200_1300_net_dir: w1200_1300.net_dir,
    sigA_prediction: sigA,
    sigA_vs_1230: isCorrect(sigA, target1230),
    sigA_vs_1200: isCorrect(sigA, target1200),
    sigB_8p: sigB8,
    sigB_10p: sigB10,
    sigB_12p: sigB12,
    sigB_15p: sigB15,
    sigB10_vs_1230: isCorrect(sigB10, target1230),
    sigB10_vs_1200: isCorrect(sigB10, target1200),
    sigC_prediction: sigC,
    sigC_dom_prediction: sigCDom,
    sigC_vs_1230: isCorrect(sigC, target1230),
    sigC_vs_1200: isCorrect(sigC, target1200),
    sigC_dom_vs_1230: isCorrect(sigCDom, target1230),
    sigC_dom_vs_1200: isCorrect(sigCDom, target1200),
    sigAC_agree: sigAC,
    sigBC_agree: sigBC,
    sigABC_agree: sigABC,
    sigAC_vs_1230: isCorrect(sigAC, target1230),
    sigBC_vs_1230: isCorrect(sigBC, target1230),
    sigABC_vs_1230: isCorrect(sigABC, target1230),
    sigAC_vs_1200: isCorrect(sigAC, target1200),
    sigBC_vs_1200: isCorrect(sigBC, target1200),
    sigABC_vs_1200: isCorrect(sigABC, target1200),
    judas_vs_1230: isCorrect(inverted, target1230),
    judas_vs_1200: isCorrect(inverted, target1200),
  };
}

function printAccuracyRow(label: string, stats: AccuracyStats): void {
  console.log(
    `${label.padEnd(22)} | ${String(stats.n_valid).padStart(7)} | ` +
    `${String(stats.correct).padStart(7)} | ${stats.accuracy}%`,
  );
}

function sigBThreshold(row: DayResult, threshold: 8 | 10 | 12 | 15): Dir | null {
  if (threshold === 8) return row.sigB_8p;
  if (threshold === 10) return row.sigB_10p;
  if (threshold === 12) return row.sigB_12p;
  return row.sigB_15p;
}

function sigBVs1230(row: DayResult, threshold: 8 | 10 | 12 | 15): boolean | null {
  return isCorrect(sigBThreshold(row, threshold), row.w1230_1300_dom_dir);
}

function writeDetailCsv(rows: DayResult[], outputPath: string): void {
  const header = [
    'trade_date', 'amd_outcome_tag', 'judas_direction', 'judas_pips',
    'w1030_1100_net_pips', 'w1030_1100_net_dir', 'w1030_1100_dom_dir',
    'w1030_1200_net_pips', 'w1030_1200_net_dir', 'w1030_1200_dom_dir',
    'w1230_1300_dom_dir', 'w1200_1300_dom_dir', 'w1200_1300_net_dir',
    'sigA_prediction', 'sigA_vs_1230', 'sigA_vs_1200',
    'sigB_8p', 'sigB_10p', 'sigB_12p', 'sigB_15p',
    'sigB10_vs_1230', 'sigB10_vs_1200',
    'sigC_prediction', 'sigC_dom_prediction', 'sigC_vs_1230', 'sigC_vs_1200',
    'sigAC_agree', 'sigBC_agree', 'sigABC_agree',
    'sigAC_vs_1230', 'sigBC_vs_1230', 'sigABC_vs_1230',
  ].join(',');

  const lines = rows.map((row) => [
    row.trade_date, row.amd_outcome_tag, row.judas_direction, row.judas_pips,
    row.w1030_1100_net_pips, row.w1030_1100_net_dir, row.w1030_1100_dom_dir,
    row.w1030_1200_net_pips, row.w1030_1200_net_dir, row.w1030_1200_dom_dir,
    row.w1230_1300_dom_dir, row.w1200_1300_dom_dir, row.w1200_1300_net_dir,
    row.sigA_prediction, row.sigA_vs_1230, row.sigA_vs_1200,
    row.sigB_8p, row.sigB_10p, row.sigB_12p, row.sigB_15p,
    row.sigB10_vs_1230, row.sigB10_vs_1200,
    row.sigC_prediction, row.sigC_dom_prediction, row.sigC_vs_1230, row.sigC_vs_1200,
    row.sigAC_agree, row.sigBC_agree, row.sigABC_agree,
    row.sigAC_vs_1230, row.sigBC_vs_1230, row.sigABC_vs_1230,
  ].join(','));

  fs.writeFileSync(outputPath, [header, ...lines].join('\n') + '\n');
}

async function main(): Promise<void> {
  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const { csvByDate, col } = loadGroundTruthCsv();

  const { data: candleRows, error: candleErr } = await supabase
    .from('amd_m5_distribution_candles')
    .select('trade_date, candles, candle_count')
    .eq('pair', PAIR)
    .eq('fetch_status', 'success')
    .order('trade_date', { ascending: true });

  if (candleErr || !candleRows) {
    throw new Error(`M5 fetch failed: ${candleErr?.message ?? 'no data'}`);
  }

  const dayRows: DayResult[] = [];
  for (const candleRow of candleRows) {
    const tradeDate = candleRow.trade_date as string;
    const candles = candleRow.candles as M5RawCandle[];
    const csvRow = csvByDate.get(tradeDate);
    if (!csvRow || !candles || candles.length < 36) continue;

    const built = buildDayResult(tradeDate, csvRow, candles, col);
    if (built) dayRows.push(built);
  }

  const totalDays = dayRows.length;
  const judas1230 = computeAccuracy(dayRows, (r) => r.judas_vs_1230, (r) => judasInverted(r.judas_direction));
  const judas1200 = computeAccuracy(dayRows, (r) => r.judas_vs_1200, (r) => judasInverted(r.judas_direction));
  const sigA1230 = computeAccuracy(dayRows, (r) => r.sigA_vs_1230, (r) => r.sigA_prediction);
  const sigA1200 = computeAccuracy(dayRows, (r) => r.sigA_vs_1200, (r) => r.sigA_prediction);
  const sigC1230 = computeAccuracy(dayRows, (r) => r.sigC_vs_1230, (r) => r.sigC_prediction);
  const sigC1200 = computeAccuracy(dayRows, (r) => r.sigC_vs_1200, (r) => r.sigC_prediction);
  const sigCDom1230 = computeAccuracy(dayRows, (r) => r.sigC_dom_vs_1230, (r) => r.sigC_dom_prediction);
  const sigAC1230 = computeAccuracy(dayRows, (r) => r.sigAC_vs_1230, (r) => r.sigAC_agree);
  const sigAC1200 = computeAccuracy(dayRows, (r) => r.sigAC_vs_1200, (r) => r.sigAC_agree);
  const sigBC1230 = computeAccuracy(dayRows, (r) => r.sigBC_vs_1230, (r) => r.sigBC_agree);
  const sigBC1200 = computeAccuracy(dayRows, (r) => r.sigBC_vs_1200, (r) => r.sigBC_agree);
  const sigABC1230 = computeAccuracy(dayRows, (r) => r.sigABC_vs_1230, (r) => r.sigABC_agree);
  const sigABC1200 = computeAccuracy(dayRows, (r) => r.sigABC_vs_1200, (r) => r.sigABC_agree);

  console.log('=== INDUSTRY SIGNAL BACKTEST — 3 SIGNALS FROM MARKET MICROSTRUCTURE RESEARCH ===');
  console.log(`${totalDays} days | AUDUSD M5`);
  console.log('Source: Gao et al. (2015), NY Reversal pattern, Asian sweep institutional research');

  console.log('\n── BASELINE ──');
  console.log(`Judas inversion accuracy vs 12:30-13:00 dominant: ${judas1230.accuracy}% (n=${judas1230.n_valid})`);
  console.log(`Judas inversion accuracy vs 12:00-13:00 dominant: ${judas1200.accuracy}% (n=${judas1200.n_valid})`);
  console.log('Random baseline (coin flip): 50%');

  console.log('\n── SIGNAL A: INTRADAY MOMENTUM (Gao et al. 2015) ──');
  console.log('10:30-11:00 net direction CONTINUES to 12:30-13:00');
  console.log(`Signal fires: ${sigA1230.n_signal} days (${pct(sigA1230.n_signal, totalDays)}% of ${totalDays})`);
  console.log('                    | N_valid | Correct | Accuracy');
  printAccuracyRow('vs 12:30-13:00 dom', sigA1230);
  printAccuracyRow('vs 12:00-13:00 dom', sigA1200);
  console.log('By outcome tag (vs 12:30-13:00):');
  for (const tag of OUTCOME_TAGS) {
    const tagged = dayRows.filter((row) => row.amd_outcome_tag === tag);
    const stats = computeAccuracy(tagged, (r) => r.sigA_vs_1230, (r) => r.sigA_prediction);
    const shortTag = tag.replace('AMD_', '').replace('_BREAKOUT', '').padEnd(11);
    console.log(`  ${shortTag}: ${stats.accuracy}% (n=${stats.n_valid})`);
  }

  console.log('\n── SIGNAL B: JUDAS PIP QUALITY FILTER (Asian sweep research) ──');
  console.log('Clean Judas sweep = larger pips = stronger reversal signal');
  console.log('Judas inversion accuracy by pip threshold (vs 12:30-13:00 dominant):');
  console.log('Threshold | N_signal | Accuracy | vs baseline');
  console.log(
    `ALL judas | ${String(judas1230.n_signal).padStart(8)} | ${String(judas1230.accuracy).padStart(7)}% | baseline`,
  );
  for (const threshold of [8, 10, 12, 15] as const) {
    const stats = computeAccuracy(dayRows, (r) => sigBVs1230(r, threshold), (r) => sigBThreshold(r, threshold));
    const delta = Math.round((stats.accuracy - judas1230.accuracy) * 10) / 10;
    const sign = delta >= 0 ? '+' : '';
    console.log(
      `>= ${threshold}p    | ${String(stats.n_signal).padStart(8)} | ${String(stats.accuracy).padStart(7)}% | ${sign}${delta}p`,
    );
  }

  console.log('\nSame vs 12:00-13:00 dominant:');
  console.log('Threshold | N_signal | Accuracy | vs baseline');
  console.log(
    `ALL judas | ${String(judas1200.n_signal).padStart(8)} | ${String(judas1200.accuracy).padStart(7)}% | baseline`,
  );
  for (const threshold of [8, 10, 12, 15] as const) {
    const stats = computeAccuracy(
      dayRows,
      (r) => isCorrect(sigBThreshold(r, threshold), r.w1200_1300_dom_dir),
      (r) => sigBThreshold(r, threshold),
    );
    const delta = Math.round((stats.accuracy - judas1200.accuracy) * 10) / 10;
    const sign = delta >= 0 ? '+' : '';
    console.log(
      `>= ${threshold}p    | ${String(stats.n_signal).padStart(8)} | ${String(stats.accuracy).padStart(7)}% | ${sign}${delta}p`,
    );
  }

  console.log('\n── SIGNAL C: NEW YORK REVERSAL PATTERN ──');
  console.log('10:30-12:00 London direction FADED at 12:00-13:00 (NY reversal)');
  console.log(
    `Signal fires (net): ${sigC1230.n_signal} days | Signal fires (dominant): ${sigCDom1230.n_signal} days`,
  );
  console.log('                         | N_valid | Correct | Accuracy');
  printAccuracyRow('Net close version', sigC1230);
  printAccuracyRow('Dominant side version', sigCDom1230);
  printAccuracyRow('vs 12:30-13:00 dom (net)', sigC1230);
  printAccuracyRow('vs 12:30-13:00 dom (dom)', sigCDom1230);

  console.log('\n── COMBINATION SIGNALS ──');
  console.log(
    `A + C agree (same direction): N=${sigAC1230.n_signal} | Accuracy vs 12:30: ${sigAC1230.accuracy}% | vs 12:00: ${sigAC1200.accuracy}%`,
  );
  console.log(
    `B(10p) + C agree:              N=${sigBC1230.n_signal} | Accuracy vs 12:30: ${sigBC1230.accuracy}% | vs 12:00: ${sigBC1200.accuracy}%`,
  );
  console.log(
    `A + B(10p) + C all agree:      N=${sigABC1230.n_signal} | Accuracy vs 12:30: ${sigABC1230.accuracy}% | vs 12:00: ${sigABC1200.accuracy}%`,
  );

  console.log('\n── BY AMD TAG — BEST SIGNAL PER TAG ──');
  const signalDefs: Array<{ name: string; getSignal: (r: DayResult) => FlatDir | null; getResult: (r: DayResult) => boolean | null }> = [
    { name: 'Signal A', getSignal: (r) => r.sigA_prediction, getResult: (r) => r.sigA_vs_1230 },
    { name: 'Signal B >=8p', getSignal: (r) => r.sigB_8p, getResult: (r) => sigBVs1230(r, 8) },
    { name: 'Signal B >=10p', getSignal: (r) => r.sigB_10p, getResult: (r) => r.sigB10_vs_1230 },
    { name: 'Signal B >=12p', getSignal: (r) => r.sigB_12p, getResult: (r) => sigBVs1230(r, 12) },
    { name: 'Signal B >=15p', getSignal: (r) => r.sigB_15p, getResult: (r) => sigBVs1230(r, 15) },
    { name: 'Signal C net', getSignal: (r) => r.sigC_prediction, getResult: (r) => r.sigC_vs_1230 },
    { name: 'Signal C dom', getSignal: (r) => r.sigC_dom_prediction, getResult: (r) => r.sigC_dom_vs_1230 },
    { name: 'Judas inversion', getSignal: (r) => judasInverted(r.judas_direction), getResult: (r) => r.judas_vs_1230 },
  ];

  for (const tag of OUTCOME_TAGS) {
    const tagged = dayRows.filter((row) => row.amd_outcome_tag === tag);
    let best = { name: 'none', accuracy: 0, n: 0 };
    for (const signalDef of signalDefs) {
      const stats = computeAccuracy(tagged, signalDef.getResult, signalDef.getSignal);
      if (stats.n_valid >= 3 && stats.accuracy > best.accuracy) {
        best = { name: signalDef.name, accuracy: stats.accuracy, n: stats.n_valid };
      }
    }
    const shortTag = tag.replace('AMD_', '').replace('_BREAKOUT', '').padEnd(11);
    console.log(`${shortTag} | Best: ${best.name} at ${best.accuracy}% (n=${best.n})`);
  }

  let bestB = { threshold: 0, accuracy: 0, n: 0 };
  for (const threshold of [8, 10, 12, 15] as const) {
    const stats = computeAccuracy(dayRows, (r) => sigBVs1230(r, threshold), (r) => sigBThreshold(r, threshold));
    if (stats.accuracy > bestB.accuracy) bestB = { threshold, accuracy: stats.accuracy, n: stats.n_valid };
  }

  const combos = [
    { label: 'A + C', stats: sigAC1230 },
    { label: 'B(10p) + C', stats: sigBC1230 },
    { label: 'A + B(10p) + C', stats: sigABC1230 },
  ];
  const bestCombo = combos.reduce((best, item) => (
    item.stats.accuracy > best.stats.accuracy ? item : best
  ), combos[0]);

  const bestOverall = [
    { name: 'Signal A', stats: sigA1230 },
    { name: 'Signal C', stats: sigC1230 },
    { name: `Signal B >=${bestB.threshold}p`, stats: computeAccuracy(dayRows, (r) => sigBVs1230(r, bestB.threshold as 8 | 10 | 12 | 15), (r) => sigBThreshold(r, bestB.threshold as 8 | 10 | 12 | 15)) },
    { name: bestCombo.label, stats: bestCombo.stats },
  ].reduce((best, item) => (item.stats.accuracy > best.stats.accuracy ? item : best));

  const improvement = Math.round((bestOverall.stats.accuracy - judas1230.accuracy) * 10) / 10;
  const bImproves = bestB.accuracy > judas1230.accuracy;

  console.log('\n── KEY FINDINGS ──');
  console.log(`Signal A accuracy vs 12:30-13:00: ${sigA1230.accuracy}% | vs 12:00-13:00: ${sigA1200.accuracy}% | fires ${pct(sigA1230.n_signal, totalDays)}% of days`);
  console.log(`Signal B best threshold:          ${bestB.accuracy}% at >=${bestB.threshold}p (n=${bestB.n})`);
  console.log(`Signal C accuracy vs 12:30-13:00: ${sigC1230.accuracy}% | vs 12:00-13:00: ${sigC1200.accuracy}%`);
  console.log(`Best combination:                 ${bestCombo.label} at ${bestCombo.stats.accuracy}% (n=${bestCombo.stats.n_valid})`);
  console.log(`Improvement over Judas inversion baseline: ${improvement >= 0 ? '+' : ''}${improvement}p`);
  console.log(`Does academic momentum signal (A) beat coin flip for AUDUSD? ${sigA1230.accuracy > 50 ? 'YES' : 'NO'}`);
  console.log(`Does Judas size filter (B) improve reversal accuracy? ${bImproves ? 'YES' : 'NO'}`);
  console.log(`Does NY reversal pattern (C) beat coin flip? ${sigC1230.accuracy > 50 ? 'YES' : 'NO'}`);

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputPath = path.join(process.cwd(), 'scripts/output', `amd_industry_signal_backtest_${stamp}.csv`);
  writeDetailCsv(dayRows, outputPath);
  console.log(`\nDetail CSV: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
