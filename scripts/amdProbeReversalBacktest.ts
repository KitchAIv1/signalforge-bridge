/**
 * Probe reversal backtest — 3 clues vs 12:00–13:00 ground truth CSV.
 * READ-ONLY research — reads amd_m5_distribution_candles + ground truth CSV.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amdProbeReversalBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';
type Dir = 'UP' | 'DOWN' | 'FLAT';

type M5RawCandle = { o: string; h: string; l: string; c: string; time?: string };

type PriorWindow = {
  prior_net_pips: number;
  prior_dirA: Dir;
  prior_dirB: Dir;
  prior_total_up: number;
  prior_total_down: number;
};

type ProbeQuality = {
  probe_avg_body_ratio: number;
  probe_rejection_rate: number;
  probe_is_weak: boolean;
};

type DayRow = {
  trade_date: string;
  amd_outcome_tag: string;
  had_reversal: boolean;
  reversal_type: string;
  first_move_dir: Dir;
  first_move_pips: number;
  dominant_dir: Dir;
  prior_dirA: Dir | null;
  prior_dirB: Dir | null;
  prior_net_pips: number | null;
  probe_avg_body_ratio: number | null;
  probe_rejection_rate: number | null;
  probe_is_weak: boolean | null;
  probe_agrees_judas: boolean | null;
  probe_counter_prior_A: boolean | null;
  probe_counter_prior_B: boolean | null;
  fake_signals_count: number;
  predicted_reversal: boolean;
  predicted_direction: Dir;
  correct_A: boolean | null;
  reversal_depth_pips: number;
};

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

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function loadGroundTruthCsv(): {
  csvHeader: string[];
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
  return { csvHeader, csvByDate, col };
}

function computePriorWindow(candles: M5RawCandle[]): PriorWindow | null {
  const prior = candles.slice(6, 24);
  if (prior.length < 18) return null;

  const open1030 = parseFloat(prior[0].o);
  const close1200 = parseFloat(prior[prior.length - 1].c);
  const netPips = Math.round((close1200 - open1030) * 10000 * 10) / 10;
  const dirA: Dir = netPips > 1 ? 'UP' : netPips < -1 ? 'DOWN' : 'FLAT';

  const slots = [prior.slice(0, 6), prior.slice(6, 12), prior.slice(12, 18)];
  let totalUp = 0;
  let totalDown = 0;
  for (const slot of slots) {
    const slotOpen = parseFloat(slot[0].o);
    const slotHigh = Math.max(...slot.map((c) => parseFloat(c.h)));
    const slotLow = Math.min(...slot.map((c) => parseFloat(c.l)));
    totalUp += (slotHigh - slotOpen) * 10000;
    totalDown += (slotOpen - slotLow) * 10000;
  }
  const dirB: Dir = totalUp > totalDown ? 'UP' : totalDown > totalUp ? 'DOWN' : 'FLAT';

  return {
    prior_net_pips: netPips,
    prior_dirA: dirA,
    prior_dirB: dirB,
    prior_total_up: Math.round(totalUp * 10) / 10,
    prior_total_down: Math.round(totalDown * 10) / 10,
  };
}

function computeProbeQuality(candles: M5RawCandle[], firstMoveDir: string): ProbeQuality | null {
  const probe = candles.slice(24, 28);
  if (probe.length < 4) return null;

  let rejectionCount = 0;
  let bodyTotal = 0;
  let rangeTotal = 0;

  for (const candle of probe) {
    const open = parseFloat(candle.o);
    const high = parseFloat(candle.h);
    const low = parseFloat(candle.l);
    const close = parseFloat(candle.c);
    const body = Math.abs(close - open);
    const range = high - low;
    if (range < 0.00001) continue;

    bodyTotal += body;
    rangeTotal += range;

    if (firstMoveDir === 'UP') {
      const upperWick = high - Math.max(open, close);
      if (upperWick > body) rejectionCount += 1;
    } else if (firstMoveDir === 'DOWN') {
      const lowerWick = Math.min(open, close) - low;
      if (lowerWick > body) rejectionCount += 1;
    }
  }

  const avgBodyRatio = rangeTotal > 0 ? bodyTotal / rangeTotal : 0;
  const rejectionRate = probe.length > 0 ? rejectionCount / probe.length : 0;
  const probeIsWeak = avgBodyRatio < 0.35 || rejectionRate >= 0.5;

  return {
    probe_avg_body_ratio: Math.round(avgBodyRatio * 100) / 100,
    probe_rejection_rate: Math.round(rejectionRate * 100) / 100,
    probe_is_weak: probeIsWeak,
  };
}

function oppositeDir(dir: Dir): Dir {
  return dir === 'UP' ? 'DOWN' : 'UP';
}

function predictReversalDir(firstMoveDir: Dir): Dir {
  return oppositeDir(firstMoveDir);
}

function dominantCorrect(predictedDir: Dir, dominantDir: Dir): boolean | null {
  if (dominantDir === 'FLAT') return null;
  return predictedDir === dominantDir;
}

function printSingleTest(
  rows: DayRow[],
  signalField: keyof DayRow,
): void {
  const fired = rows.filter((row) => row[signalField] === true);
  const notFired = rows.filter((row) => row[signalField] === false);
  const firedReversal = fired.filter((row) => row.had_reversal).length;
  const firedCorrectSimple = fired.filter((row) =>
    dominantCorrect(predictReversalDir(row.first_move_dir), row.dominant_dir) === true,
  ).length;
  const notFiredReversal = notFired.filter((row) => row.had_reversal).length;

  console.log(`Signal fires: ${fired.length} days | Non-fires: ${notFired.length} days`);
  console.log(`When signal fires → had_reversal: ${pct(firedReversal, fired.length)}% (n=${fired.length})`);
  console.log(`When signal fires → dominant direction correct: ${pct(firedCorrectSimple, fired.length)}% (n=${fired.length})`);
  console.log(
    `When signal fires → avg reversal_depth: ${avg(fired.map((row) => row.reversal_depth_pips))}p`,
  );
  console.log(`When no signal → had_reversal: ${pct(notFiredReversal, notFired.length)}% (baseline)`);
}

function printCombinedTest(title: string, rows: DayRow[], minSignals: number): void {
  const fired = rows.filter((row) => row.fake_signals_count >= minSignals);
  const predictedReversal = fired.filter((row) => row.predicted_reversal);
  const predictedContinuation = fired.filter((row) => !row.predicted_reversal);
  const actualReversal = predictedReversal.filter((row) => row.had_reversal).length;
  const actualContinuation = predictedContinuation.filter((row) => row.reversal_type === 'CONTINUATION').length;
  const overallCorrect = fired.filter((row) => row.correct_A === true).length;

  console.log(`\n── ${title} ──`);
  console.log(`Signal fires: ${fired.length} days (${pct(fired.length, rows.length)}% of all days)`);
  console.log(
    `Predicted reversal → actually reversed: ${pct(actualReversal, predictedReversal.length)}% (n=${predictedReversal.length})`,
  );
  console.log(
    `Predicted reversal → avg reversal_depth: ${avg(predictedReversal.map((row) => row.reversal_depth_pips))}p`,
  );
  console.log(
    `Predicted continuation → actually continued: ${pct(actualContinuation, predictedContinuation.length)}% (n=${predictedContinuation.length})`,
  );
  console.log(`Overall direction accuracy (dominant dir): ${pct(overallCorrect, fired.length)}%`);
}

function writeDetailCsv(rows: DayRow[], outputPath: string): void {
  const header = [
    'trade_date', 'amd_outcome_tag', 'had_reversal',
    'first_move_dir', 'first_move_pips', 'dominant_dir',
    'prior_dirA', 'prior_dirB', 'prior_net_pips',
    'probe_avg_body_ratio', 'probe_rejection_rate', 'probe_is_weak',
    'probe_agrees_judas', 'probe_counter_prior_A', 'probe_counter_prior_B',
    'fake_signals_count', 'predicted_reversal', 'predicted_direction',
    'correct_A', 'reversal_depth_pips',
  ].join(',');

  const lines = rows.map((row) => [
    row.trade_date, row.amd_outcome_tag, row.had_reversal,
    row.first_move_dir, row.first_move_pips, row.dominant_dir,
    row.prior_dirA ?? '', row.prior_dirB ?? '', row.prior_net_pips ?? '',
    row.probe_avg_body_ratio ?? '', row.probe_rejection_rate ?? '', row.probe_is_weak ?? '',
    row.probe_agrees_judas ?? '', row.probe_counter_prior_A ?? '', row.probe_counter_prior_B ?? '',
    row.fake_signals_count, row.predicted_reversal, row.predicted_direction,
    row.correct_A ?? '', row.reversal_depth_pips,
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

  const dayRows: DayRow[] = [];

  for (const candleRow of candleRows) {
    const tradeDate = candleRow.trade_date as string;
    const candles = candleRow.candles as M5RawCandle[];
    const csvRow = csvByDate.get(tradeDate);
    if (!csvRow || !candles || candles.length < 36) continue;

    const firstMoveDir = col(csvRow, 'first_move_direction') as Dir;
    if (firstMoveDir !== 'UP' && firstMoveDir !== 'DOWN') continue;

    const hadReversal = col(csvRow, 'had_reversal') === 'true';
    const dominantDir = col(csvRow, 'dominant_direction') as Dir;
    const judasDir = col(csvRow, 'judas_direction');
    const prior = computePriorWindow(candles);
    const probe = computeProbeQuality(candles, firstMoveDir);

    const probeAgreesJudas = judasDir === 'UP' || judasDir === 'DOWN'
      ? firstMoveDir === judasDir
      : null;
    const probeCounterPriorA = prior
      ? prior.prior_dirA !== 'FLAT' && firstMoveDir !== prior.prior_dirA
      : null;
    const probeCounterPriorB = prior
      ? prior.prior_dirB !== 'FLAT' && firstMoveDir !== prior.prior_dirB
      : null;
    const probeWeak = probe?.probe_is_weak ?? null;

    const fakeSignals = [
      probeAgreesJudas === true ? 1 : 0,
      probeCounterPriorA === true ? 1 : 0,
      probeWeak === true ? 1 : 0,
    ].reduce((a, b) => a + b, 0);

    const predictedReversal = fakeSignals >= 2;
    const predictedDirection: Dir = predictedReversal
      ? oppositeDir(firstMoveDir)
      : firstMoveDir;

    dayRows.push({
      trade_date: tradeDate,
      amd_outcome_tag: col(csvRow, 'amd_outcome_tag'),
      had_reversal: hadReversal,
      reversal_type: col(csvRow, 'reversal_type'),
      first_move_dir: firstMoveDir,
      first_move_pips: parseFloat(col(csvRow, 'first_move_pips')) || 0,
      dominant_dir: dominantDir,
      prior_dirA: prior?.prior_dirA ?? null,
      prior_dirB: prior?.prior_dirB ?? null,
      prior_net_pips: prior?.prior_net_pips ?? null,
      probe_avg_body_ratio: probe?.probe_avg_body_ratio ?? null,
      probe_rejection_rate: probe?.probe_rejection_rate ?? null,
      probe_is_weak: probeWeak,
      probe_agrees_judas: probeAgreesJudas,
      probe_counter_prior_A: probeCounterPriorA,
      probe_counter_prior_B: probeCounterPriorB,
      fake_signals_count: fakeSignals,
      predicted_reversal: predictedReversal,
      predicted_direction: predictedDirection,
      correct_A: dominantCorrect(predictedDirection, dominantDir),
      reversal_depth_pips: parseFloat(col(csvRow, 'reversal_depth_pips')) || 0,
    });
  }

  const total = dayRows.length;
  const reversalDays = dayRows.filter((row) => row.had_reversal).length;
  const continuationDays = dayRows.filter((row) => row.reversal_type === 'CONTINUATION').length;
  const mixedStalled = total - reversalDays - continuationDays;

  console.log('=== PROBE REVERSAL BACKTEST ===');
  console.log(`${total} days | Three clues tested against 12:00-13:00 ground truth`);
  console.log('Entry logic: observe first probe 12:00-12:20, predict dominant direction');

  console.log('\n── POPULATION ──');
  console.log(`Days with first move direction: ${total}`);
  console.log(`Reversal days (had_reversal=true): ${reversalDays} (${pct(reversalDays, total)}%)`);
  console.log(`Continuation days: ${continuationDays} (${pct(continuationDays, total)}%)`);
  console.log(`Mixed/Stalled: ${mixedStalled} (${pct(mixedStalled, total)}%)`);

  console.log('\n── TEST A: PROBE AGREES WITH JUDAS DIRECTION ──');
  console.log('(Probe goes same direction as Judas fake spike → suspect fake → predict reversal)');
  printSingleTest(dayRows, 'probe_agrees_judas');

  console.log('\n── TEST B: PROBE COUNTER TO 10:30-12:00 PRIOR DIRECTION (Option A net) ──');
  console.log('(Prior was DOWN, probe goes UP → counter-trend → suspect fake)');
  printSingleTest(dayRows, 'probe_counter_prior_A');

  console.log('\n── TEST B2: PROBE COUNTER TO PRIOR (Option B dominant side) ──');
  printSingleTest(dayRows, 'probe_counter_prior_B');

  console.log('\n── TEST C: PROBE WEAKNESS (wick rejection >= 50% of probe candles) ──');
  printSingleTest(dayRows, 'probe_is_weak');

  printCombinedTest('COMBINED: 2+ SIGNALS AGREE = FAKE PROBE', dayRows, 2);
  printCombinedTest('COMBINED: 3/3 SIGNALS AGREE = STRONGEST FAKE PROBE', dayRows, 3);

  console.log('\n── BY AMD TAG ──');
  console.log('Tag | Fire rate (2+) | Reversal% when fired | Accuracy%');
  for (const tag of ['AMD_TEXTBOOK', 'AMD_COMPRESSION_BREAKOUT', 'AMD_FAILED', 'AMD_SHIFTED', 'AMD_NONE']) {
    const tagged = dayRows.filter((row) => row.amd_outcome_tag === tag);
    const fired = tagged.filter((row) => row.fake_signals_count >= 2);
    const reversalWhenFired = fired.filter((row) => row.had_reversal).length;
    const correctWhenFired = fired.filter((row) => row.correct_A === true).length;
    const shortTag = tag.replace('AMD_', '').replace('_BREAKOUT', '');
    console.log(
      `${shortTag.padEnd(11)} | ${pct(fired.length, tagged.length)}% | ` +
      `${pct(reversalWhenFired, fired.length)}% | ${pct(correctWhenFired, fired.length)}%`,
    );
  }

  const baselineReversal = pct(reversalDays, total);
  const tests = [
    { label: 'A (Judas agree)', field: 'probe_agrees_judas' as keyof DayRow },
    { label: 'B (Counter prior A)', field: 'probe_counter_prior_A' as keyof DayRow },
    { label: 'B2 (Counter prior B)', field: 'probe_counter_prior_B' as keyof DayRow },
    { label: 'C (Probe weak)', field: 'probe_is_weak' as keyof DayRow },
  ];

  let bestTest = { label: '', acc: 0, n: 0 };
  for (const test of tests) {
    const fired = dayRows.filter((row) => row[test.field] === true);
    const correct = fired.filter((row) =>
      dominantCorrect(predictReversalDir(row.first_move_dir), row.dominant_dir) === true,
    ).length;
    const acc = pct(correct, fired.length);
    if (fired.length > 0 && acc >= bestTest.acc) {
      bestTest = { label: test.label, acc, n: fired.length };
    }
  }

  const combined2 = dayRows.filter((row) => row.fake_signals_count >= 2);
  const combined2Correct = combined2.filter((row) => row.correct_A === true).length;
  const combined3 = dayRows.filter((row) => row.fake_signals_count >= 3);
  const combined3Correct = combined3.filter((row) => row.correct_A === true).length;

  console.log('\n── KEY FINDINGS ──');
  console.log(`Best single test: ${bestTest.label} at ${bestTest.acc}% reversal prediction accuracy (n=${bestTest.n})`);
  console.log(`Combined 2+: ${pct(combined2Correct, combined2.length)}% accuracy (n=${combined2.length})`);
  console.log(`Combined 3/3: ${pct(combined3Correct, combined3.length)}% accuracy (n=${combined3.length})`);
  console.log(`Baseline reversal rate: ${baselineReversal}%`);
  console.log(
    `Improvement over baseline: +${Math.round((pct(combined2.filter((row) => row.had_reversal).length, combined2.length) - baselineReversal) * 10) / 10} points`,
  );

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputPath = path.join(process.cwd(), 'scripts/output', `amd_probe_reversal_backtest_${stamp}.csv`);
  writeDetailCsv(dayRows, outputPath);
  console.log(`\nDetail CSV: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
