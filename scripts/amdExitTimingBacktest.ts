/**
 * Exit timing backtest — TP/SL/time exit grid across S1-S4 routed days.
 * READ-ONLY research — M5 candles + ground truth CSV + industry signal CSV.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amdExitTimingBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';
const SPREAD_PIPS = 1.5;
type Dir = 'UP' | 'DOWN';
type FlatDir = Dir | 'FLAT';
type Subgroup = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
type M5RawCandle = { o: string; h: string; l: string; c: string; time?: string };
type TradeOutcome = 'TP_HIT' | 'SL_HIT' | 'TIME_EXIT';

const EXIT_TIMES = [
  { label: '12:45', lastIdx: 32 },
  { label: '12:50', lastIdx: 33 },
  { label: '12:55', lastIdx: 34 },
  { label: '13:00', lastIdx: 35 },
] as const;

const TP_LEVELS = [4, 5, 6, 7, 8, 9, 10] as const;
const SL_LEVELS = [3, 4, 5, 6, 7, 8] as const;

type TradeResult = {
  outcome: TradeOutcome;
  pips: number;
  exit_candle_idx: number;
  exit_time: string;
};

type RoutedDay = {
  trade_date: string;
  amd_outcome_tag: string;
  subgroup: Subgroup;
  predicted_dir: Dir;
  candles: M5RawCandle[];
};

type CombinationStats = {
  exit_time: string;
  tp: number;
  sl: number;
  rr: number;
  n: number;
  tp_count: number;
  sl_count: number;
  time_count: number;
  tp_pct: number;
  sl_pct: number;
  time_pct: number;
  avg_pips: number;
  net_pips_after_spread: number;
  total_pips: number;
  expected_value: number;
  win_pct: number;
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

function loadCsv(relativePath: string): {
  csvByDate: Map<string, string[]>;
  col: (row: string[], name: string) => string;
} {
  const csvPath = path.join(__dirname, relativePath);
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
): {
  open: number;
  close: number;
  high: number;
  low: number;
  net_pips: number;
  up_pips: number;
  down_pips: number;
  net_dir: FlatDir;
  dom_dir: FlatDir;
} | null {
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

function routeDay(
  outcomeTag: string,
  judasDir: string,
  sigCDomPred: string,
  sigBCAgree: string,
): { subgroup: Subgroup; predicted_dir: Dir | null } {
  if (outcomeTag === 'AMD_TEXTBOOK') {
    const dir = judasDir === 'UP' ? 'DOWN' : judasDir === 'DOWN' ? 'UP' : null;
    return { subgroup: 'S1', predicted_dir: dir };
  }

  if (outcomeTag === 'AMD_COMPRESSION_BREAKOUT') {
    const dir = judasDir === 'UP' ? 'UP' : judasDir === 'DOWN' ? 'DOWN' : null;
    return { subgroup: 'S2', predicted_dir: dir };
  }

  if (outcomeTag === 'AMD_NONE') {
    const dir = sigCDomPred === 'UP' ? 'UP' : sigCDomPred === 'DOWN' ? 'DOWN' : null;
    return { subgroup: 'S3', predicted_dir: dir };
  }

  if (
    (outcomeTag === 'AMD_FAILED' || outcomeTag === 'AMD_SHIFTED')
    && (sigBCAgree === 'UP' || sigBCAgree === 'DOWN')
  ) {
    return { subgroup: 'S4', predicted_dir: sigBCAgree as Dir };
  }

  return { subgroup: 'S5', predicted_dir: null };
}

function candleCloseTime(idx: number): string {
  const exitMin = 600 + (idx + 1) * 5;
  const hh = Math.floor(exitMin / 60).toString().padStart(2, '0');
  const mm = (exitMin % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function simulateTrade(
  candles: M5RawCandle[],
  dir: Dir,
  tpPips: number,
  slPips: number,
  exitLastIdx: number,
): TradeResult {
  const entry = parseFloat(candles[24].o);
  const tpPrice = dir === 'UP' ? entry + tpPips / 10000 : entry - tpPips / 10000;
  const slPrice = dir === 'UP' ? entry - slPips / 10000 : entry + slPips / 10000;

  for (let i = 24; i <= exitLastIdx; i += 1) {
    const high = parseFloat(candles[i].h);
    const low = parseFloat(candles[i].l);
    const tpHit = dir === 'UP' ? high >= tpPrice : low <= tpPrice;
    const slHit = dir === 'UP' ? low <= slPrice : high >= slPrice;

    if (slHit) {
      return { outcome: 'SL_HIT', pips: -slPips, exit_candle_idx: i, exit_time: candleCloseTime(i) };
    }
    if (tpHit) {
      return { outcome: 'TP_HIT', pips: tpPips, exit_candle_idx: i, exit_time: candleCloseTime(i) };
    }
  }

  const exitClose = parseFloat(candles[exitLastIdx].c);
  const raw = dir === 'UP' ? (exitClose - entry) * 10000 : (entry - exitClose) * 10000;
  return {
    outcome: 'TIME_EXIT',
    pips: Math.round(raw * 10) / 10,
    exit_candle_idx: exitLastIdx,
    exit_time: candleCloseTime(exitLastIdx),
  };
}

function simulateTimeOnly(candles: M5RawCandle[], dir: Dir, exitLastIdx: number): number {
  const entry = parseFloat(candles[24].o);
  const exitClose = parseFloat(candles[exitLastIdx].c);
  const raw = dir === 'UP' ? (exitClose - entry) * 10000 : (entry - exitClose) * 10000;
  return Math.round(raw * 10) / 10;
}

function buildCombinationStats(
  days: RoutedDay[],
  exitLabel: string,
  lastIdx: number,
  tp: number,
  sl: number,
): CombinationStats {
  const results = days.map((day) =>
    simulateTrade(day.candles, day.predicted_dir, tp, sl, lastIdx),
  );
  const tpCount = results.filter((r) => r.outcome === 'TP_HIT').length;
  const slCount = results.filter((r) => r.outcome === 'SL_HIT').length;
  const timeCount = results.filter((r) => r.outcome === 'TIME_EXIT').length;
  const pips = results.map((r) => r.pips);
  const avgPips = avg(pips);
  const tpPct = pct(tpCount, days.length);
  const slPct = pct(slCount, days.length);
  const timePct = pct(timeCount, days.length);
  const winCount = results.filter((r) => r.pips > 0).length;

  return {
    exit_time: exitLabel,
    tp,
    sl,
    rr: Math.round((tp / sl) * 10) / 10,
    n: days.length,
    tp_count: tpCount,
    sl_count: slCount,
    time_count: timeCount,
    tp_pct: tpPct,
    sl_pct: slPct,
    time_pct: timePct,
    avg_pips: avgPips,
    net_pips_after_spread: Math.round((avgPips - SPREAD_PIPS) * 10) / 10,
    total_pips: Math.round(pips.reduce((a, b) => a + b, 0) * 10) / 10,
    expected_value: Math.round((tpPct / 100 * tp - slPct / 100 * sl) * 10) / 10,
    win_pct: pct(winCount, days.length),
  };
}

function runAllCombinations(days: RoutedDay[]): CombinationStats[] {
  const stats: CombinationStats[] = [];
  for (const exit of EXIT_TIMES) {
    for (const tp of TP_LEVELS) {
      for (const sl of SL_LEVELS) {
        stats.push(buildCombinationStats(days, exit.label, exit.lastIdx, tp, sl));
      }
    }
  }
  return stats;
}

function printTopRow(rank: number, combo: CombinationStats): void {
  console.log(
    `${String(rank).padStart(4)} | ${combo.exit_time.padEnd(5)} | ${String(combo.tp).padStart(2)}p | ` +
    `${String(combo.sl).padStart(2)}p | ${String(combo.rr).padStart(4)}x | ${String(combo.tp_pct).padStart(4)}% | ` +
    `${String(combo.sl_pct).padStart(4)}% | ${String(combo.time_pct).padStart(5)}% | ${String(combo.avg_pips).padStart(6)}p | ` +
    `${String(combo.net_pips_after_spread).padStart(8)}p | ${String(Math.round((combo.total_pips - combo.n * SPREAD_PIPS) * 10) / 10).padStart(6)}p`,
  );
}

function writeCombinationCsv(stats: CombinationStats[], outputPath: string): void {
  const header = [
    'exit_time', 'tp', 'sl', 'rr', 'n', 'tp_count', 'sl_count', 'time_count',
    'tp_pct', 'sl_pct', 'time_pct', 'avg_pips', 'net_per_trade', 'total_pips', 'expected_value',
  ].join(',');
  const lines = stats.map((c) => [
    c.exit_time, c.tp, c.sl, c.rr, c.n, c.tp_count, c.sl_count, c.time_count,
    c.tp_pct, c.sl_pct, c.time_pct, c.avg_pips, c.net_pips_after_spread, c.total_pips, c.expected_value,
  ].join(','));
  fs.writeFileSync(outputPath, [header, ...lines].join('\n') + '\n');
}

function writeDayDetailCsv(
  days: RoutedDay[],
  best: CombinationStats,
  outputPath: string,
): void {
  const exit = EXIT_TIMES.find((e) => e.label === best.exit_time);
  if (!exit) return;

  const header = [
    'trade_date', 'subgroup', 'predicted_dir', 'amd_outcome_tag',
    'best_combo_exit', 'best_combo_tp', 'best_combo_sl',
    'best_combo_outcome', 'best_combo_pips',
  ].join(',');

  const lines = days.map((day) => {
    const result = simulateTrade(day.candles, day.predicted_dir, best.tp, best.sl, exit.lastIdx);
    return [
      day.trade_date, day.subgroup, day.predicted_dir, day.amd_outcome_tag,
      best.exit_time, best.tp, best.sl, result.outcome, result.pips,
    ].join(',');
  });

  fs.writeFileSync(outputPath, [header, ...lines].join('\n') + '\n');
}

async function main(): Promise<void> {
  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const { csvByDate: gtByDate, col: gtCol } = loadCsv('output/amd_1200_slot_ground_truth_20260605.csv');
  const { csvByDate: indByDate, col: indCol } = loadCsv('output/amd_industry_signal_backtest_20260605.csv');

  const { data: candleRows, error: candleErr } = await supabase
    .from('amd_m5_distribution_candles')
    .select('trade_date, candles, candle_count')
    .eq('pair', PAIR)
    .eq('fetch_status', 'success')
    .order('trade_date', { ascending: true });

  if (candleErr || !candleRows) {
    throw new Error(`M5 fetch failed: ${candleErr?.message ?? 'no data'}`);
  }

  const candlesByDate = new Map<string, M5RawCandle[]>();
  for (const candleRow of candleRows) {
    candlesByDate.set(candleRow.trade_date as string, candleRow.candles as M5RawCandle[]);
  }

  const routedDays: RoutedDay[] = [];
  for (const [tradeDate, gtRow] of gtByDate) {
    const candles = candlesByDate.get(tradeDate);
    const indRow = indByDate.get(tradeDate);
    if (!candles || candles.length < 36 || !indRow) continue;

    const routed = routeDay(
      gtCol(gtRow, 'amd_outcome_tag'),
      gtCol(gtRow, 'judas_direction'),
      indCol(indRow, 'sigC_dom_prediction'),
      indCol(indRow, 'sigBC_agree'),
    );
    if (routed.subgroup === 'S5' || !routed.predicted_dir) continue;

    routedDays.push({
      trade_date: tradeDate,
      amd_outcome_tag: gtCol(gtRow, 'amd_outcome_tag'),
      subgroup: routed.subgroup,
      predicted_dir: routed.predicted_dir,
      candles,
    });
  }

  const combinedStats = runAllCombinations(routedDays);
  const sortedCombined = [...combinedStats].sort(
    (a, b) => b.net_pips_after_spread - a.net_pips_after_spread,
  );
  const bestOverall = sortedCombined[0];

  const bySubgroup = (sub: Subgroup) => routedDays.filter((d) => d.subgroup === sub);
  const subgroupCombos = {
    S1: runAllCombinations(bySubgroup('S1')),
    S2: runAllCombinations(bySubgroup('S2')),
    S3: runAllCombinations(bySubgroup('S3')),
    S4: runAllCombinations(bySubgroup('S4')),
  };

  console.log('=== EXIT TIMING BACKTEST — 168 COMBINATIONS ===');
  console.log(`Entry: 12:00 UTC open | ${routedDays.length} routed days | 4 exits × 7 TPs × 6 SLs`);

  console.log('\n── TOP 10 COMBINATIONS — ALL ROUTED DAYS (S1-S4 combined) ──');
  console.log('Ranked by: net pips after spread per trade');
  console.log(
    'Rank | Exit  | TP  | SL  | R:R  | TP%  | SL%  | Time% | AvgPips | Net/trade | Total net',
  );
  sortedCombined.slice(0, 10).forEach((combo, i) => printTopRow(i + 1, combo));

  console.log('\n── TOP 5 PER SUBGROUP ──');
  for (const [label, sub, days] of [
    ['S1 TEXTBOOK', 'S1', bySubgroup('S1')],
    ['S2 COMPRESSION', 'S2', bySubgroup('S2')],
    ['S3 NONE+C', 'S3', bySubgroup('S3')],
    ['S4 B+C FAILED/SHIFTED', 'S4', bySubgroup('S4')],
  ] as const) {
    console.log(`\n${label} (n=${days.length}):`);
    console.log('Rank | Exit  | TP | SL | TP% | SL% | Net/trade');
    const top = [...subgroupCombos[sub]].sort((a, b) => b.net_pips_after_spread - a.net_pips_after_spread);
    top.slice(0, 5).forEach((combo, i) => {
      console.log(
        `${String(i + 1).padStart(4)} | ${combo.exit_time.padEnd(5)} | ${String(combo.tp).padStart(2)}p | ` +
        `${String(combo.sl).padStart(2)}p | ${String(combo.tp_pct).padStart(4)}% | ${String(combo.sl_pct).padStart(4)}% | ` +
        `${String(combo.net_pips_after_spread).padStart(8)}p`,
      );
    });
  }

  console.log('\n── PURE TIME EXIT (no TP/SL) — BASELINE ──');
  for (const exit of EXIT_TIMES) {
    const pips = routedDays.map((d) => simulateTimeOnly(d.candles, d.predicted_dir, exit.lastIdx));
    const avgP = avg(pips);
    console.log(
      `Exit ${exit.label} | AvgPips: ${avgP}p | Net: ${Math.round((avgP - SPREAD_PIPS) * 10) / 10}p`,
    );
  }

  console.log('\n── BEST TP BY EXIT TIME — ALL DAYS ──');
  for (const exit of EXIT_TIMES) {
    const forExit = combinedStats
      .filter((c) => c.exit_time === exit.label)
      .sort((a, b) => b.net_pips_after_spread - a.net_pips_after_spread)[0];
    console.log(
      `Exit ${exit.label}: Best TP=${forExit.tp}p SL=${forExit.sl}p at ${forExit.tp_pct}% TP hit, ` +
      `${forExit.net_pips_after_spread}p net`,
    );
  }

  const sl3Avg = avg(combinedStats.filter((c) => c.sl === 3).map((c) => c.net_pips_after_spread));
  const sl8Avg = avg(combinedStats.filter((c) => c.sl === 8).map((c) => c.net_pips_after_spread));
  const baselineNet = Math.round(
    (avg(routedDays.map((d) => simulateTimeOnly(d.candles, d.predicted_dir, 35))) - SPREAD_PIPS) * 10,
  ) / 10;

  const avgByExit = EXIT_TIMES.map((exit) => ({
    label: exit.label,
    avg: avg(combinedStats.filter((c) => c.exit_time === exit.label).map((c) => c.net_pips_after_spread)),
  })).sort((a, b) => b.avg - a.avg);
  const avgByTp = TP_LEVELS.map((tp) => ({
    tp,
    avg: avg(combinedStats.filter((c) => c.tp === tp).map((c) => c.net_pips_after_spread)),
  })).sort((a, b) => b.avg - a.avg);
  const avgBySl = SL_LEVELS.map((sl) => ({
    sl,
    avg: avg(combinedStats.filter((c) => c.sl === sl).map((c) => c.net_pips_after_spread)),
  })).sort((a, b) => b.avg - a.avg);

  console.log('\n── SL IMPACT ANALYSIS ──');
  console.log(`With SL=3p: avg net = ${sl3Avg}p | With SL=8p: avg net = ${sl8Avg}p`);
  console.log(`Tight SL better or wider SL better? ${sl3Avg >= sl8Avg ? 'TIGHT' : 'WIDE'}`);

  const bestPerSub = (sub: 'S1' | 'S2' | 'S3' | 'S4') => {
    const top = [...subgroupCombos[sub]].sort((a, b) => b.net_pips_after_spread - a.net_pips_after_spread)[0];
    return top;
  };

  console.log('\n── KEY FINDINGS ──');
  console.log(`Current baseline (no TP/SL, 13:00 exit): ${baselineNet}p net/trade`);
  console.log(
    `Best combination overall: Exit ${bestOverall.exit_time}, TP=${bestOverall.tp}p, SL=${bestOverall.sl}p ` +
    `at ${bestOverall.net_pips_after_spread}p net/trade`,
  );
  const improvement = Math.round((bestOverall.net_pips_after_spread - baselineNet) * 10) / 10;
  console.log(
    `Improvement over baseline: ${improvement >= 0 ? '+' : ''}${improvement}p/trade`,
  );
  console.log(`Best exit time (averaged across TPs/SLs): ${avgByExit[0].label}`);
  console.log(`Best TP level (averaged across times/SLs): ${avgByTp[0].tp}p`);
  console.log(`Best SL level (averaged across times/TPs): ${avgBySl[0].sl}p`);

  for (const [label, sub] of [
    ['S1', 'S1'],
    ['S2', 'S2'],
    ['S3', 'S3'],
    ['S4', 'S4'],
  ] as const) {
    const top = bestPerSub(sub);
    console.log(
      `${label} best combo: Exit ${top.exit_time} TP=${top.tp}p SL=${top.sl}p at ${top.net_pips_after_spread}p net (n=${top.n})`,
    );
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const comboPath = path.join(process.cwd(), 'scripts/output', `amd_exit_combinations_${stamp}.csv`);
  const detailPath = path.join(process.cwd(), 'scripts/output', `amd_exit_day_detail_${stamp}.csv`);
  writeCombinationCsv(combinedStats, comboPath);
  writeDayDetailCsv(routedDays, bestOverall, detailPath);
  console.log(`\nCombination CSV: ${comboPath}`);
  console.log(`Day detail CSV: ${detailPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
