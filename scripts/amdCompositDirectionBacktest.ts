/**
 * Composite direction routing backtest — S1-S4 priority subgroup system.
 * READ-ONLY research — M5 candles + ground truth CSV + industry signal CSV.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amdCompositDirectionBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';
type Dir = 'UP' | 'DOWN';
type FlatDir = Dir | 'FLAT';
type Subgroup = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
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
  judas_direction: string;
  judas_pips: number;
  subgroup: Subgroup;
  predicted_dir: Dir | null;
  correct_dir: boolean | null;
  net_pips: number | null;
  mfe: number | null;
  mae: number | null;
  dom_1200_1300: FlatDir;
  dom_1230_1300: FlatDir;
  isAgree: boolean;
};

type SubgroupStats = {
  n: number;
  n_with_direction: number;
  n_valid_accuracy: number;
  correct_dir: number;
  accuracy_pct: number;
  avg_net_pips: number;
  pct_positive: number;
  pct_3p: number;
  pct_5p: number;
  avg_mfe: number;
  avg_mae: number;
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

function isAgree(row: string[], col: (r: string[], n: string) => string): boolean {
  const dir = col(row, 'decision_auto_direction');
  const asian = col(row, 'asian_close_bias_signal');
  if (dir !== 'long' && dir !== 'short') return false;
  if (dir === 'long' && asian === 'BULLISH') return true;
  if (dir === 'short' && asian === 'BEARISH') return true;
  return false;
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

function pipCaptureForDir(entry: number, exitPrice: number, dir: Dir): number {
  const raw = dir === 'UP'
    ? (exitPrice - entry) * 10000
    : (entry - exitPrice) * 10000;
  return Math.round(raw * 10) / 10;
}

function mfeForDir(
  entry: number,
  candles: M5RawCandle[],
  startIdx: number,
  endIdx: number,
  dir: Dir,
): number {
  const slice = candles.slice(startIdx, endIdx);
  if (dir === 'UP') {
    const highestHigh = Math.max(...slice.map((c) => parseFloat(c.h)));
    return Math.round((highestHigh - entry) * 10000 * 10) / 10;
  }
  const lowestLow = Math.min(...slice.map((c) => parseFloat(c.l)));
  return Math.round((entry - lowestLow) * 10000 * 10) / 10;
}

function maeForDir(
  entry: number,
  candles: M5RawCandle[],
  startIdx: number,
  endIdx: number,
  dir: Dir,
): number {
  const slice = candles.slice(startIdx, endIdx);
  if (dir === 'UP') {
    const lowestLow = Math.min(...slice.map((c) => parseFloat(c.l)));
    return Math.round((entry - lowestLow) * 10000 * 10) / 10;
  }
  const highestHigh = Math.max(...slice.map((c) => parseFloat(c.h)));
  return Math.round((highestHigh - entry) * 10000 * 10) / 10;
}

function computeStats(days: DayResult[]): SubgroupStats {
  const withDir = days.filter((day) => day.predicted_dir !== null);
  const validAcc = withDir.filter((day) => day.correct_dir !== null);
  const correct = validAcc.filter((day) => day.correct_dir === true);
  const withPips = withDir.filter((day) => day.net_pips !== null);

  const avg = (values: number[]) => (
    values.length > 0
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
      : 0
  );

  const pips = withPips.map((day) => day.net_pips as number);
  return {
    n: days.length,
    n_with_direction: withDir.length,
    n_valid_accuracy: validAcc.length,
    correct_dir: correct.length,
    accuracy_pct: validAcc.length > 0
      ? Math.round((correct.length / validAcc.length) * 1000) / 10
      : 0,
    avg_net_pips: avg(pips),
    pct_positive: pips.length > 0
      ? Math.round((pips.filter((value) => value > 0).length / pips.length) * 1000) / 10
      : 0,
    pct_3p: pips.length > 0
      ? Math.round((pips.filter((value) => value >= 3).length / pips.length) * 1000) / 10
      : 0,
    pct_5p: pips.length > 0
      ? Math.round((pips.filter((value) => value >= 5).length / pips.length) * 1000) / 10
      : 0,
    avg_mfe: avg(withPips.map((day) => day.mfe as number)),
    avg_mae: avg(withPips.map((day) => day.mae as number)),
  };
}

function printStatsRow(label: string, stats: SubgroupStats): void {
  console.log(
    `${label.padEnd(11)} | ${String(stats.n).padStart(3)} | ${String(stats.n_with_direction).padStart(8)} | ` +
    `${String(stats.accuracy_pct).padStart(7)}% | ${String(stats.avg_net_pips).padStart(6)}p | ` +
    `${String(stats.pct_positive).padStart(4)}% | ${String(stats.pct_3p).padStart(5)}% | ` +
    `${String(stats.pct_5p).padStart(5)}% | ${String(stats.avg_mfe).padStart(4)}p | ${String(stats.avg_mae).padStart(4)}p`,
  );
}

function writeDetailCsv(rows: DayResult[], outputPath: string): void {
  const header = [
    'trade_date', 'amd_outcome_tag', 'judas_direction', 'judas_pips',
    'subgroup', 'predicted_dir', 'correct_dir',
    'net_pips', 'mfe', 'mae',
    'dom_1200_1300', 'dom_1230_1300',
  ].join(',');

  const lines = rows.map((row) => [
    row.trade_date, row.amd_outcome_tag, row.judas_direction, row.judas_pips,
    row.subgroup, row.predicted_dir ?? '', row.correct_dir ?? '',
    row.net_pips ?? '', row.mfe ?? '', row.mae ?? '',
    row.dom_1200_1300, row.dom_1230_1300,
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

  const dayRows: DayResult[] = [];
  for (const [tradeDate, gtRow] of gtByDate) {
    const candles = candlesByDate.get(tradeDate);
    const indRow = indByDate.get(tradeDate);
    if (!candles || candles.length < 36 || !indRow) continue;

    const w1200_1300 = aggregateWindow(candles, 24, 36);
    const w1230_1300 = aggregateWindow(candles, 30, 36);
    if (!w1200_1300 || !w1230_1300) continue;

    const outcomeTag = gtCol(gtRow, 'amd_outcome_tag');
    const judasDir = gtCol(gtRow, 'judas_direction');
    const judasPips = parseFloat(gtCol(gtRow, 'judas_pips')) || 0;
    const sigCDomPred = indCol(indRow, 'sigC_dom_prediction');
    const sigBCAgree = indCol(indRow, 'sigBC_agree');

    const routed = routeDay(outcomeTag, judasDir, sigCDomPred, sigBCAgree);
    const predictedDir = routed.predicted_dir;
    const entry1200 = parseFloat(candles[24].o);
    const exit1300 = parseFloat(candles[35].c);

    const netPips = predictedDir
      ? pipCaptureForDir(entry1200, exit1300, predictedDir)
      : null;
    const mfe = predictedDir
      ? mfeForDir(entry1200, candles, 24, 36, predictedDir)
      : null;
    const mae = predictedDir
      ? maeForDir(entry1200, candles, 24, 36, predictedDir)
      : null;

    const dom1200 = w1200_1300.dom_dir;
    const correctDir = predictedDir && dom1200 !== 'FLAT'
      ? predictedDir === dom1200
      : null;

    dayRows.push({
      trade_date: tradeDate,
      amd_outcome_tag: outcomeTag,
      judas_direction: judasDir,
      judas_pips: judasPips,
      subgroup: routed.subgroup,
      predicted_dir: predictedDir,
      correct_dir: correctDir,
      net_pips: netPips,
      mfe,
      mae,
      dom_1200_1300: dom1200,
      dom_1230_1300: w1230_1300.dom_dir,
      isAgree: isAgree(gtRow, gtCol),
    });
  }

  const totalDays = dayRows.length;
  const bySubgroup = (sub: Subgroup) => dayRows.filter((day) => day.subgroup === sub);
  const routedDays = dayRows.filter((day) => day.subgroup !== 'S5');
  const combined = routedDays;

  const s1 = bySubgroup('S1');
  const s2 = bySubgroup('S2');
  const s3 = bySubgroup('S3');
  const s4 = bySubgroup('S4');
  const s5 = bySubgroup('S5');

  const s1Stats = computeStats(s1);
  const s2Stats = computeStats(s2);
  const s3Stats = computeStats(s3);
  const s4Stats = computeStats(s4);
  const combinedStats = computeStats(combined);

  const s2Agree = s2.filter((day) => day.isAgree);
  const s2NonAgree = s2.filter((day) => !day.isAgree);
  const s2AgreeStats = computeStats(s2Agree);
  const s2NonAgreeStats = computeStats(s2NonAgree);

  const tradeable = combined.filter((day) => day.predicted_dir !== null && day.net_pips !== null);
  const totalNetPips = Math.round(tradeable.reduce((sum, day) => sum + (day.net_pips as number), 0) * 10) / 10;
  const afterSpread = Math.round((totalNetPips - tradeable.length * 1.5) * 10) / 10;
  const avgPerTrade = tradeable.length > 0
    ? Math.round((totalNetPips / tradeable.length) * 10) / 10
    : 0;
  const afterSpreadPerTrade = tradeable.length > 0
    ? Math.round((afterSpread / tradeable.length) * 10) / 10
    : 0;
  const winRate = pct(tradeable.filter((day) => (day.net_pips as number) > 0).length, tradeable.length);
  const spreadBreakevenPct = pct(
    tradeable.filter((day) => (day.net_pips as number) > 1.5).length,
    tradeable.length,
  );

  const subgroupStatsList = [
    { key: 'S1', stats: s1Stats },
    { key: 'S2', stats: s2Stats },
    { key: 'S3', stats: s3Stats },
    { key: 'S4', stats: s4Stats },
  ];
  const bestAcc = subgroupStatsList.reduce((best, item) => (
    item.stats.accuracy_pct > best.stats.accuracy_pct ? item : best
  ), subgroupStatsList[0]);
  const bestPips = subgroupStatsList.reduce((best, item) => (
    item.stats.avg_net_pips > best.stats.avg_net_pips ? item : best
  ), subgroupStatsList[0]);

  console.log('=== COMPOSITE DIRECTION ROUTING BACKTEST ===');
  console.log(`${totalDays} days | Priority routing: S1→S2→S3→S4→S5`);
  console.log('Entry: 12:00 UTC open | Exit: 13:00 UTC close');

  console.log('\n── ROUTING SUMMARY ──');
  console.log(`S1 TEXTBOOK   (Judas inversion):     ${s1.length} days (${pct(s1.length, totalDays)}%)`);
  console.log(`S2 COMPRESSION (Judas continuation): ${s2.length} days (${pct(s2.length, totalDays)}%)`);
  console.log(`S3 NONE+C     (fade London):         ${s3.length} days (${pct(s3.length, totalDays)}%)`);
  console.log(`S4 B+C FAILED/SHIFTED:               ${s4.length} days (${pct(s4.length, totalDays)}%)`);
  console.log(`S5 No signal  (FAILED/SHIFTED):      ${s5.length} days (${pct(s5.length, totalDays)}%)`);
  console.log(`Total routed (S1-S4):                ${routedDays.length} days (${pct(routedDays.length, totalDays)}%)`);

  console.log('\n── DIRECTIONAL ACCURACY PER SUBGROUP ──');
  console.log('            | N   | With Dir | Accuracy | AvgPips | %Pos | %>=3p | %>=5p | MFE  | MAE');
  printStatsRow('S1 TEXTBOOK', s1Stats);
  printStatsRow('S2 COMPRESS', s2Stats);
  printStatsRow('S3 NONE+C', s3Stats);
  printStatsRow('S4 B+C F/S', s4Stats);
  printStatsRow('COMBINED', combinedStats);
  console.log(
    `${'S5 BASELINE'.padEnd(11)} | ${String(s5.length).padStart(3)} | ${String(0).padStart(8)} | ` +
    `${'N/A'.padStart(7)}  | ${'N/A'.padStart(6)}  |      |       |       |      |`,
  );

  console.log('\n── S2 COMPRESSION SPLIT — AGREE vs NON-AGREE ──');
  console.log(
    `S2 AGREE (auto_dir+asian_close match):     N=${s2AgreeStats.n} | Accuracy: ${s2AgreeStats.accuracy_pct}% | AvgPips: ${s2AgreeStats.avg_net_pips}p`,
  );
  console.log(
    `S2 NON-AGREE:                              N=${s2NonAgreeStats.n} | Accuracy: ${s2NonAgreeStats.accuracy_pct}% | AvgPips: ${s2NonAgreeStats.avg_net_pips}p`,
  );

  console.log('\n── COMBINED PORTFOLIO SIMULATION ──');
  console.log('Assuming 1 unit per trade, enter at 12:00, exit at 13:00');
  console.log(`Total trades (S1-S4): ${tradeable.length}`);
  console.log(`Total net pips: ${totalNetPips}p`);
  console.log(`Avg pips per trade: ${avgPerTrade}p`);
  console.log(`Win rate: ${winRate}%`);
  console.log(`After 1.5p spread per trade: ${afterSpread}p net (${afterSpreadPerTrade}p/trade)`);

  console.log('\n── KEY FINDINGS ──');
  console.log(`S1 accuracy: ${s1Stats.accuracy_pct}% (n=${s1Stats.n}) — Judas inversion on TEXTBOOK`);
  console.log(`S2 accuracy: ${s2Stats.accuracy_pct}% (n=${s2Stats.n}) — Judas continuation on COMPRESSION`);
  console.log(`S3 accuracy: ${s3Stats.accuracy_pct}% (n=${s3Stats.n}) — Fade London on NONE`);
  console.log(`S4 accuracy: ${s4Stats.accuracy_pct}% (n=${s4Stats.n}) — B+C on FAILED/SHIFTED`);
  console.log(`Combined accuracy across S1-S4: ${combinedStats.accuracy_pct}% (n=${combinedStats.n_valid_accuracy})`);
  console.log(`Best subgroup by accuracy: ${bestAcc.key} at ${bestAcc.stats.accuracy_pct}%`);
  console.log(`Best subgroup by avg pips: ${bestPips.key} at ${bestPips.stats.avg_net_pips}p`);
  console.log(`Spread breakeven: ${spreadBreakevenPct}% of routed days produce >1.5p`);
  console.log(
    `Does composite routing beat coin flip? ${combinedStats.accuracy_pct > 50 ? 'YES' : 'NO'} at ${combinedStats.accuracy_pct}%`,
  );
  console.log(
    `Does composite routing produce positive net pips after spread? ${afterSpreadPerTrade > 0 ? 'YES' : 'NO'} at ${afterSpreadPerTrade}p/trade`,
  );

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputPath = path.join(process.cwd(), 'scripts/output', `amd_composite_direction_${stamp}.csv`);
  writeDetailCsv(dayRows, outputPath);
  console.log(`\nDetail CSV: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
