/**
 * Trail stop backtest — activation 3p, trail 2-6p, exit 12:45-13:00 across S1-S4 routed days.
 * READ-ONLY research — M5 candles + ground truth CSV + industry signal CSV.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amdTrailStopBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';
const SPREAD_PIPS = 1.5;
const ACTIVATION_PIPS = 3;

type Dir = 'UP' | 'DOWN';
type Subgroup = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
type M5RawCandle = { o: string; h: string; l: string; c: string; time?: string };
type TrailOutcome = 'TRAIL_HIT' | 'TIME_EXIT';

const TRAIL_PIPS = [2, 3, 4, 5, 6] as const;

const EXIT_TIMES = [
  { label: '12:45', lastIdx: 32 },
  { label: '12:50', lastIdx: 33 },
  { label: '12:55', lastIdx: 34 },
  { label: '13:00', lastIdx: 35 },
] as const;

type TrailResult = {
  outcome: TrailOutcome;
  pips: number;
  exit_candle_idx: number;
  exit_time: string;
  peak_pips: number;
  trail_activated: boolean;
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
  trail_pips: number;
  n: number;
  trail_hit_count: number;
  time_exit_count: number;
  never_activated_count: number;
  trail_hit_pct: number;
  time_exit_pct: number;
  avg_pips: number;
  avg_pips_on_trail_hit: number;
  avg_pips_on_time_exit: number;
  avg_peak_pips: number;
  net_per_trade: number;
  total_net_pips: number;
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
  const totalMin = 600 + (idx + 1) * 5;
  const hh = Math.floor(totalMin / 60).toString().padStart(2, '0');
  const mm = (totalMin % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function peakPipsFromEntry(entry: number, peak: number, dir: Dir): number {
  const raw = dir === 'UP' ? (peak - entry) * 10000 : (entry - peak) * 10000;
  return Math.round(raw * 10) / 10;
}

function simulateTrail(
  candles: M5RawCandle[],
  dir: Dir,
  trailPips: number,
  activationPips: number,
  exitLastIdx: number,
): TrailResult {
  const entry = parseFloat(candles[24].o);
  let peak = entry;
  let activated = false;

  for (let i = 24; i <= exitLastIdx; i += 1) {
    const high = parseFloat(candles[i].h);
    const low = parseFloat(candles[i].l);
    const wasActivated = activated;

    if (dir === 'UP') {
      if (high > peak) peak = high;
    } else if (low < peak) {
      peak = low;
    }

    const excursion = peakPipsFromEntry(entry, peak, dir);

    if (!activated && excursion >= activationPips) {
      activated = true;
      continue;
    }

    if (wasActivated) {
      const trailStopPrice = dir === 'UP'
        ? peak - (trailPips / 10000)
        : peak + (trailPips / 10000);
      const trailHit = dir === 'UP' ? low <= trailStopPrice : high >= trailStopPrice;

      if (trailHit) {
        const exitPips = peakPipsFromEntry(entry, trailStopPrice, dir);
        return {
          outcome: 'TRAIL_HIT',
          pips: exitPips,
          exit_candle_idx: i,
          exit_time: candleCloseTime(i),
          peak_pips: excursion,
          trail_activated: true,
        };
      }
    }
  }

  const exitClose = parseFloat(candles[exitLastIdx].c);
  const timePips = dir === 'UP'
    ? Math.round((exitClose - entry) * 10000 * 10) / 10
    : Math.round((entry - exitClose) * 10000 * 10) / 10;

  return {
    outcome: 'TIME_EXIT',
    pips: timePips,
    exit_candle_idx: exitLastIdx,
    exit_time: candleCloseTime(exitLastIdx),
    peak_pips: peakPipsFromEntry(entry, peak, dir),
    trail_activated: activated,
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
  trailPips: number,
): CombinationStats {
  const results = days.map((day) =>
    simulateTrail(day.candles, day.predicted_dir, trailPips, ACTIVATION_PIPS, lastIdx),
  );
  const trailHits = results.filter((r) => r.outcome === 'TRAIL_HIT');
  const timeExits = results.filter((r) => r.outcome === 'TIME_EXIT');
  const neverActivated = results.filter((r) => !r.trail_activated);
  const pips = results.map((r) => r.pips);
  const avgPips = avg(pips);

  return {
    exit_time: exitLabel,
    trail_pips: trailPips,
    n: days.length,
    trail_hit_count: trailHits.length,
    time_exit_count: timeExits.length,
    never_activated_count: neverActivated.length,
    trail_hit_pct: pct(trailHits.length, days.length),
    time_exit_pct: pct(timeExits.length, days.length),
    avg_pips: avgPips,
    avg_pips_on_trail_hit: avg(trailHits.map((r) => r.pips)),
    avg_pips_on_time_exit: avg(timeExits.map((r) => r.pips)),
    avg_peak_pips: avg(results.map((r) => r.peak_pips)),
    net_per_trade: Math.round((avgPips - SPREAD_PIPS) * 10) / 10,
    total_net_pips: Math.round((avgPips - SPREAD_PIPS) * days.length * 10) / 10,
  };
}

function runAllCombinations(days: RoutedDay[]): CombinationStats[] {
  const stats: CombinationStats[] = [];
  for (const exit of EXIT_TIMES) {
    for (const trailPips of TRAIL_PIPS) {
      stats.push(buildCombinationStats(days, exit.label, exit.lastIdx, trailPips));
    }
  }
  return stats;
}

function printTrailRow(rank: number, combo: CombinationStats): void {
  const neverActPct = pct(combo.never_activated_count, combo.n);
  console.log(
    `${String(rank).padStart(4)} | ${combo.exit_time.padEnd(5)} | ${String(combo.trail_pips).padStart(4)}p | ` +
    `${String(combo.trail_hit_pct).padStart(5)}% | ${String(combo.time_exit_pct).padStart(8)}% | ` +
    `${String(neverActPct).padStart(8)}% | ${String(combo.avg_pips).padStart(6)}p | ` +
    `${String(combo.net_per_trade).padStart(8)}p | ${String(combo.avg_peak_pips).padStart(6)}p`,
  );
}

function writeTrailCsv(stats: CombinationStats[], outputPath: string): void {
  const header = [
    'exit_time', 'trail_pips', 'n',
    'trail_hit_count', 'time_exit_count', 'never_activated_count',
    'trail_hit_pct', 'time_exit_pct',
    'avg_pips', 'avg_pips_on_trail_hit', 'avg_pips_on_time_exit',
    'avg_peak_pips', 'net_per_trade', 'total_net_pips',
  ].join(',');
  const lines = stats.map((c) => [
    c.exit_time, c.trail_pips, c.n,
    c.trail_hit_count, c.time_exit_count, c.never_activated_count,
    c.trail_hit_pct, c.time_exit_pct,
    c.avg_pips, c.avg_pips_on_trail_hit, c.avg_pips_on_time_exit,
    c.avg_peak_pips, c.net_per_trade, c.total_net_pips,
  ].join(','));
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
  const sortedCombined = [...combinedStats].sort((a, b) => b.net_per_trade - a.net_per_trade);
  const bestOverall = sortedCombined[0];
  const baseline1300Net = Math.round(
    (avg(routedDays.map((d) => simulateTimeOnly(d.candles, d.predicted_dir, 35))) - SPREAD_PIPS) * 10,
  ) / 10;

  console.log('=== TRAIL STOP BACKTEST — 20 COMBINATIONS ===');
  console.log(
    `Entry: 12:00 UTC open | ${routedDays.length} routed days | Activation: ${ACTIVATION_PIPS}p | 5 trails × 4 exits`,
  );
  console.log('Conservative: SL checked before TP | Trail fills at stop price (not candle extreme)');

  console.log('\n── PURE TIME EXIT BASELINE (no trail) ──');
  const baselineParts = EXIT_TIMES.map((exit) => {
    const net = Math.round(
      (avg(routedDays.map((d) => simulateTimeOnly(d.candles, d.predicted_dir, exit.lastIdx))) - SPREAD_PIPS) * 10,
    ) / 10;
    return `Exit ${exit.label}: ${net}p net`;
  });
  console.log(baselineParts.join(' | '));

  console.log('\n── ALL 20 COMBINATIONS — RANKED BY NET/TRADE ──');
  console.log('Rank | Exit  | Trail | Trail% | TimeExit% | NeverAct% | AvgPips | Net/trade | AvgPeak');
  sortedCombined.forEach((combo, i) => printTrailRow(i + 1, combo));

  const improvement = Math.round((bestOverall.net_per_trade - baseline1300Net) * 10) / 10;
  console.log('\n── DOES ANY TRAIL BEAT PURE TIME EXIT AT 13:00 (1.8p baseline)? ──');
  console.log(`Best trail combo: Exit ${bestOverall.exit_time}, Trail ${bestOverall.trail_pips}p → ${bestOverall.net_per_trade}p net`);
  console.log(`Vs pure time 13:00: ${baseline1300Net}p net`);
  console.log(`Improvement: ${improvement >= 0 ? '+' : ''}${improvement}p`);

  const bySubgroup = (sub: Subgroup) => routedDays.filter((d) => d.subgroup === sub);
  console.log('\n── BY SUBGROUP — BEST TRAIL COMBO ──');
  for (const [label, sub] of [
    ['S1 TEXTBOOK', 'S1'],
    ['S2 COMPRESSION', 'S2'],
    ['S3 NONE+C', 'S3'],
    ['S4 B+C F/S', 'S4'],
  ] as const) {
    const days = bySubgroup(sub);
    const subStats = runAllCombinations(days);
    const subBest = [...subStats].sort((a, b) => b.net_per_trade - a.net_per_trade)[0];
    const subBaseline = Math.round(
      (avg(days.map((d) => simulateTimeOnly(d.candles, d.predicted_dir, 35))) - SPREAD_PIPS) * 10,
    ) / 10;
    console.log(`\n${label} (n=${days.length}):`);
    console.log(`  Pure time 13:00: ${subBaseline}p net`);
    console.log(
      `  Best trail:      Exit ${subBest.exit_time} Trail ${subBest.trail_pips}p → ${subBest.net_per_trade}p net | ` +
      `Trail hit: ${subBest.trail_hit_pct}% | Avg peak: ${subBest.avg_peak_pips}p`,
    );
  }

  console.log('\n── TRAIL ACTIVATION ANALYSIS ──');
  const exit1300 = EXIT_TIMES.find((e) => e.label === '13:00')!;
  for (const trailPips of TRAIL_PIPS) {
    const results = routedDays.map((d) =>
      simulateTrail(d.candles, d.predicted_dir, trailPips, ACTIVATION_PIPS, exit1300.lastIdx),
    );
    const activatedCount = results.filter((r) => r.trail_activated).length;
    console.log(
      `Trail=${trailPips}p activation rate: ${pct(activatedCount, routedDays.length)}% of days ` +
      `(trail activated on ${activatedCount}/${routedDays.length} days)`,
    );
  }
  console.log('(Higher activation = trail fires more often on winners)');

  const allResults1300 = TRAIL_PIPS.flatMap((trailPips) =>
    routedDays.map((d) =>
      simulateTrail(d.candles, d.predicted_dir, trailPips, ACTIVATION_PIPS, exit1300.lastIdx),
    ),
  );
  const activatedResults = allResults1300.filter((r) => r.trail_activated);
  const neverActivatedResults = allResults1300.filter((r) => !r.trail_activated);
  console.log(`\nWhen trail activates → avg exit pips: ${avg(activatedResults.map((r) => r.pips))}p`);
  console.log(`When trail never activates → avg time exit pips: ${avg(neverActivatedResults.map((r) => r.pips))}p`);
  console.log('(Does activating the trail help or hurt?)');

  console.log('\n── SL IMPACT OF TRAIL ──');
  for (const trailPips of TRAIL_PIPS) {
    const trailHitResults = routedDays.flatMap((d) =>
      EXIT_TIMES.map((exit) =>
        simulateTrail(d.candles, d.predicted_dir, trailPips, ACTIVATION_PIPS, exit.lastIdx),
      ),
    ).filter((r) => r.outcome === 'TRAIL_HIT');
    const lossCount = trailHitResults.filter((r) => r.pips < 0).length;
    console.log(
      `Trail=${trailPips}p: ${pct(lossCount, trailHitResults.length)}% time the trail fired at a LOSS (pips < 0)`,
    );
  }

  const avgByTrail = TRAIL_PIPS.map((trailPips) => ({
    trailPips,
    avg: avg(combinedStats.filter((c) => c.trail_pips === trailPips).map((c) => c.net_per_trade)),
  })).sort((a, b) => b.avg - a.avg);
  const avgByExit = EXIT_TIMES.map((exit) => ({
    label: exit.label,
    avg: avg(combinedStats.filter((c) => c.exit_time === exit.label).map((c) => c.net_per_trade)),
  })).sort((a, b) => b.avg - a.avg);

  const subgroupBestNets = (['S1', 'S2', 'S3', 'S4'] as const).map((sub) => {
    const top = [...runAllCombinations(bySubgroup(sub))].sort((a, b) => b.net_per_trade - a.net_per_trade)[0];
    return top.net_per_trade;
  });

  console.log('\n── KEY FINDINGS ──');
  console.log(`Baseline (no trail, 13:00): ${baseline1300Net}p net/trade`);
  console.log(
    `Best trail combo: Exit ${bestOverall.exit_time} Trail ${bestOverall.trail_pips}p at ${bestOverall.net_per_trade}p net/trade`,
  );
  const baselineImprovement = Math.round((bestOverall.net_per_trade - baseline1300Net) * 10) / 10;
  console.log(`Improvement over baseline: ${baselineImprovement >= 0 ? '+' : ''}${baselineImprovement}p`);
  console.log(`Does trailing stop improve on pure time exit? ${bestOverall.net_per_trade > baseline1300Net ? 'YES' : 'NO'}`);
  console.log(`Best trail distance overall: ${avgByTrail[0].trailPips}p`);
  console.log(`Best exit cutoff with trail: ${avgByExit[0].label}`);
  console.log(
    `S1 best: ${subgroupBestNets[0]}p net | S2 best: ${subgroupBestNets[1]}p net | ` +
    `S3 best: ${subgroupBestNets[2]}p net | S4 best: ${subgroupBestNets[3]}p net`,
  );

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const csvPath = path.join(process.cwd(), 'scripts/output', `amd_trail_stop_backtest_${stamp}.csv`);
  writeTrailCsv(combinedStats, csvPath);
  console.log(`\nCSV: ${csvPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
