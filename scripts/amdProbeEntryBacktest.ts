/**
 * Probe entry backtest — fade entry at 12:25/12:30, pip capture to 13:00.
 * READ-ONLY research — reads amd_m5_distribution_candles + ground truth CSV.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amdProbeEntryBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';
type Dir = 'UP' | 'DOWN';
type M5RawCandle = { o: string; h: string; l: string; c: string; time?: string };

const EXIT_KEYS = ['p1235', 'p1240', 'p1245', 'p1250', 'p1255', 'p1300'] as const;
const EXIT_LABELS: Record<typeof EXIT_KEYS[number], string> = {
  p1235: '12:35',
  p1240: '12:40',
  p1245: '12:45',
  p1250: '12:50',
  p1255: '12:55',
  p1300: '13:00',
};

type EntryExits = {
  p1235: number;
  p1240: number;
  p1245: number;
  p1250: number;
  p1255: number;
  p1300: number;
  mfe_to_1300: number;
  mae_to_1300: number;
};

type DayRow = {
  trade_date: string;
  amd_outcome_tag: string;
  first_move_dir: Dir;
  first_move_pips: number;
  probe_peak_price: number;
  fade_dir: Dir;
  fading_at_1225: boolean;
  fade_depth_1225: number;
  fading_at_1230: boolean;
  fade_depth_1230: number;
  had_reversal: boolean;
  reversal_depth_pips: number;
  entryA_price: number;
  entryA: EntryExits;
  entryB_price: number;
  entryB: EntryExits;
};

type EntryStats = {
  n: number;
  avgByExit: Record<typeof EXIT_KEYS[number], number>;
  pctPosByExit: Record<typeof EXIT_KEYS[number], number>;
  pct3pByExit: Record<typeof EXIT_KEYS[number], number>;
  pct5pByExit: Record<typeof EXIT_KEYS[number], number>;
  avgMfe: number;
  avgMae: number;
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

function pipCapture(entry: number, exitPrice: number, dir: Dir): number {
  const raw = dir === 'DOWN'
    ? (entry - exitPrice) * 10000
    : (exitPrice - entry) * 10000;
  return Math.round(raw * 10) / 10;
}

function mfe(
  entry: number,
  candles: M5RawCandle[],
  fromIdx: number,
  toIdx: number,
  dir: Dir,
): number {
  const window = candles.slice(fromIdx, toIdx + 1);
  if (dir === 'DOWN') {
    const lowestLow = Math.min(...window.map((c) => parseFloat(c.l)));
    return Math.round((entry - lowestLow) * 10000 * 10) / 10;
  }
  const highestHigh = Math.max(...window.map((c) => parseFloat(c.h)));
  return Math.round((highestHigh - entry) * 10000 * 10) / 10;
}

function mae(
  entry: number,
  candles: M5RawCandle[],
  fromIdx: number,
  toIdx: number,
  dir: Dir,
): number {
  const window = candles.slice(fromIdx, toIdx + 1);
  if (dir === 'DOWN') {
    const highestHigh = Math.max(...window.map((c) => parseFloat(c.h)));
    return Math.round((highestHigh - entry) * 10000 * 10) / 10;
  }
  const lowestLow = Math.min(...window.map((c) => parseFloat(c.l)));
  return Math.round((entry - lowestLow) * 10000 * 10) / 10;
}

function buildEntryExits(
  candles: M5RawCandle[],
  entryIdx: number,
  entryPrice: number,
  fadeDir: Dir,
): EntryExits {
  return {
    p1235: pipCapture(entryPrice, parseFloat(candles[31].o), fadeDir),
    p1240: pipCapture(entryPrice, parseFloat(candles[32].o), fadeDir),
    p1245: pipCapture(entryPrice, parseFloat(candles[33].o), fadeDir),
    p1250: pipCapture(entryPrice, parseFloat(candles[34].o), fadeDir),
    p1255: pipCapture(entryPrice, parseFloat(candles[35].o), fadeDir),
    p1300: pipCapture(entryPrice, parseFloat(candles[35].c), fadeDir),
    mfe_to_1300: mfe(entryPrice, candles, entryIdx, 35, fadeDir),
    mae_to_1300: mae(entryPrice, candles, entryIdx, 35, fadeDir),
  };
}

function computeEntryStats(rows: DayRow[], entry: 'A' | 'B'): EntryStats {
  const exitsKey = entry === 'A' ? 'entryA' : 'entryB';
  const avgByExit = {} as Record<typeof EXIT_KEYS[number], number>;
  const pctPosByExit = {} as Record<typeof EXIT_KEYS[number], number>;
  const pct3pByExit = {} as Record<typeof EXIT_KEYS[number], number>;
  const pct5pByExit = {} as Record<typeof EXIT_KEYS[number], number>;

  for (const key of EXIT_KEYS) {
    const values = rows.map((row) => row[exitsKey][key]);
    avgByExit[key] = avg(values);
    pctPosByExit[key] = pct(values.filter((value) => value > 0).length, values.length);
    pct3pByExit[key] = pct(values.filter((value) => value >= 3).length, values.length);
    pct5pByExit[key] = pct(values.filter((value) => value >= 5).length, values.length);
  }

  return {
    n: rows.length,
    avgByExit,
    pctPosByExit,
    pct3pByExit,
    pct5pByExit,
    avgMfe: avg(rows.map((row) => row[exitsKey].mfe_to_1300)),
    avgMae: avg(rows.map((row) => row[exitsKey].mae_to_1300)),
  };
}

function printEntryTable(title: string, rows: DayRow[], entry: 'A' | 'B'): EntryStats {
  const stats = computeEntryStats(rows, entry);
  console.log(`\n── ${title} (n=${stats.n}) ──`);
  console.log('EXIT    | AvgPips | %Positive | %>=3p | %>=5p');
  for (const key of EXIT_KEYS) {
    console.log(
      `${EXIT_LABELS[key].padEnd(7)} | ${String(stats.avgByExit[key]).padStart(6)}p | ` +
      `${String(stats.pctPosByExit[key]).padStart(8)}% | ${String(stats.pct3pByExit[key]).padStart(5)}% | ` +
      `${String(stats.pct5pByExit[key]).padStart(5)}%`,
    );
  }
  console.log(`AvgMFE: ${stats.avgMfe}p | AvgMAE: ${stats.avgMae}p`);
  return stats;
}

function bestExit(stats: EntryStats): { label: string; avg: number; pctPos: number } {
  let best = { label: EXIT_LABELS.p1300, avg: stats.avgByExit.p1300, pctPos: stats.pctPosByExit.p1300 };
  for (const key of EXIT_KEYS) {
    if (stats.avgByExit[key] > best.avg) {
      best = { label: EXIT_LABELS[key], avg: stats.avgByExit[key], pctPos: stats.pctPosByExit[key] };
    }
  }
  return best;
}

function spreadBreakevenExit(stats: EntryStats, threshold: number): string {
  for (const key of EXIT_KEYS) {
    if (stats.avgByExit[key] >= threshold) return EXIT_LABELS[key];
  }
  return 'none';
}

function writeDetailCsv(rows: DayRow[], outputPath: string): void {
  const header = [
    'trade_date', 'amd_outcome_tag', 'first_move_dir', 'first_move_pips',
    'probe_peak_price', 'fade_dir',
    'fading_at_1225', 'fade_depth_1225', 'fading_at_1230', 'fade_depth_1230',
    'had_reversal', 'reversal_depth_pips',
    'entryA_price', 'A_p1235', 'A_p1240', 'A_p1245', 'A_p1250', 'A_p1255', 'A_p1300',
    'A_mfe', 'A_mae',
    'entryB_price', 'B_p1235', 'B_p1240', 'B_p1245', 'B_p1250', 'B_p1255', 'B_p1300',
    'B_mfe', 'B_mae',
  ].join(',');

  const lines = rows.map((row) => [
    row.trade_date, row.amd_outcome_tag, row.first_move_dir, row.first_move_pips,
    row.probe_peak_price, row.fade_dir,
    row.fading_at_1225, row.fade_depth_1225, row.fading_at_1230, row.fade_depth_1230,
    row.had_reversal, row.reversal_depth_pips,
    row.entryA_price, row.entryA.p1235, row.entryA.p1240, row.entryA.p1245,
    row.entryA.p1250, row.entryA.p1255, row.entryA.p1300,
    row.entryA.mfe_to_1300, row.entryA.mae_to_1300,
    row.entryB_price, row.entryB.p1235, row.entryB.p1240, row.entryB.p1245,
    row.entryB.p1250, row.entryB.p1255, row.entryB.p1300,
    row.entryB.mfe_to_1300, row.entryB.mae_to_1300,
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

    const probeDir = col(csvRow, 'first_move_direction');
    if (probeDir !== 'UP' && probeDir !== 'DOWN') continue;

    const firstMovePips = parseFloat(col(csvRow, 'first_move_pips')) || 0;
    const open1200 = parseFloat(candles[24].o);
    const probePeakPrice = probeDir === 'UP'
      ? open1200 + firstMovePips / 10000
      : open1200 - firstMovePips / 10000;

    const price1225 = parseFloat(candles[29].o);
    const price1230 = parseFloat(candles[30].o);
    const fadeDir: Dir = probeDir === 'UP' ? 'DOWN' : 'UP';

    const fadingAt1225 = probeDir === 'UP'
      ? price1225 < probePeakPrice
      : price1225 > probePeakPrice;
    const fadingAt1230 = probeDir === 'UP'
      ? price1230 < probePeakPrice
      : price1230 > probePeakPrice;

    const fadeDepth1225 = probeDir === 'UP'
      ? Math.round((probePeakPrice - price1225) * 10000 * 10) / 10
      : Math.round((price1225 - probePeakPrice) * 10000 * 10) / 10;
    const fadeDepth1230 = probeDir === 'UP'
      ? Math.round((probePeakPrice - price1230) * 10000 * 10) / 10
      : Math.round((price1230 - probePeakPrice) * 10000 * 10) / 10;

    const entryA = parseFloat(candles[29].o);
    const entryB = parseFloat(candles[30].o);

    dayRows.push({
      trade_date: tradeDate,
      amd_outcome_tag: col(csvRow, 'amd_outcome_tag'),
      first_move_dir: probeDir,
      first_move_pips: firstMovePips,
      probe_peak_price: probePeakPrice,
      fade_dir: fadeDir,
      fading_at_1225: fadingAt1225,
      fade_depth_1225: fadeDepth1225,
      fading_at_1230: fadingAt1230,
      fade_depth_1230: fadeDepth1230,
      had_reversal: col(csvRow, 'had_reversal') === 'true',
      reversal_depth_pips: parseFloat(col(csvRow, 'reversal_depth_pips')) || 0,
      entryA_price: entryA,
      entryA: buildEntryExits(candles, 29, entryA, fadeDir),
      entryB_price: entryB,
      entryB: buildEntryExits(candles, 30, entryB, fadeDir),
    });
  }

  const total = dayRows.length;
  const fading1225 = dayRows.filter((row) => row.fading_at_1225);
  const fading1230 = dayRows.filter((row) => row.fading_at_1230);
  const reversalRows = dayRows.filter((row) => row.had_reversal);
  const revFade1225 = dayRows.filter((row) => row.had_reversal && row.fading_at_1225);
  const revFade1230 = dayRows.filter((row) => row.had_reversal && row.fading_at_1230);

  console.log('=== PROBE ENTRY BACKTEST — FADE ENTRY AT 12:25 AND 12:30 ===');
  console.log(`${total} days | Entry: fade direction after probe peak | No prediction — pure observation`);

  console.log('\n── POPULATION ──');
  console.log(`All days with first move: ${total}`);
  console.log(`Fading at 12:25 (price below/above probe peak): ${fading1225.length} (${pct(fading1225.length, total)}%)`);
  console.log(`Fading at 12:30: ${fading1230.length} (${pct(fading1230.length, total)}%)`);
  console.log(`Reversal days (had_reversal=true): ${reversalRows.length} (${pct(reversalRows.length, total)}%)`);
  console.log(
    `Reversal + fading at 12:25: ${revFade1225.length} (${pct(revFade1225.length, reversalRows.length)}% of reversal days)`,
  );
  console.log(
    `Reversal + fading at 12:30: ${revFade1230.length} (${pct(revFade1230.length, reversalRows.length)}% of reversal days)`,
  );

  const allA = printEntryTable('ENTRY A: 12:25 FADE ENTRY — ALL DAYS', dayRows, 'A');
  const allB = printEntryTable('ENTRY B: 12:30 FADE ENTRY — ALL DAYS', dayRows, 'B');
  const fadeA = printEntryTable('ENTRY A: 12:25 — FADING DAYS ONLY', fading1225, 'A');
  printEntryTable('ENTRY A: 12:25 — REVERSAL DAYS ONLY', reversalRows, 'A');
  const revFadeA = printEntryTable('ENTRY A: 12:25 — REVERSAL + FADING AT 12:25', revFade1225, 'A');

  console.log('\n── BY AMD TAG — ENTRY A 13:00 EXIT SUMMARY ──');
  console.log('TAG         | N  | AvgPips | %Pos | %>=3p | %>=5p | AvgMFE');
  for (const tag of ['AMD_TEXTBOOK', 'AMD_COMPRESSION_BREAKOUT', 'AMD_FAILED', 'AMD_SHIFTED', 'AMD_NONE']) {
    const tagged = dayRows.filter((row) => row.amd_outcome_tag === tag);
    const stats = computeEntryStats(tagged, 'A');
    const shortTag = tag.replace('AMD_', '').replace('_BREAKOUT', '').padEnd(11);
    console.log(
      `${shortTag} | ${String(stats.n).padStart(2)} | ${String(stats.avgByExit.p1300).padStart(6)}p | ` +
      `${String(stats.pctPosByExit.p1300).padStart(4)}% | ${String(stats.pct3pByExit.p1300).padStart(5)}% | ` +
      `${String(stats.pct5pByExit.p1300).padStart(5)}% | ${stats.avgMfe}p`,
    );
  }

  console.log('\n── BY FADE DEPTH AT 12:25 — ENTRY A ──');
  const shallow = fading1225.filter((row) => row.fade_depth_1225 < 1);
  const medium = fading1225.filter((row) => row.fade_depth_1225 >= 1 && row.fade_depth_1225 <= 3);
  const deep = fading1225.filter((row) => row.fade_depth_1225 > 3);
  for (const [label, group] of [
    ['Shallow (<1p fade)', shallow],
    ['Medium (1-3p fade)', medium],
    ['Deep (>3p fade)', deep],
  ] as const) {
    const stats = computeEntryStats(group, 'A');
    console.log(
      `${label}: N=${stats.n} | AvgPips 13:00: ${stats.avgByExit.p1300}p | %>=3p: ${stats.pct3pByExit.p1300}%`,
    );
  }

  const revA = computeEntryStats(reversalRows, 'A');
  const revB = computeEntryStats(reversalRows, 'B');
  const bestA = bestExit(allA);
  const bestB = bestExit(allB);

  let bestSubgroup = { name: 'ALL DAYS', avg: allA.avgByExit.p1300, pct3p: allA.pct3pByExit.p1300, n: total };
  for (const [name, group] of [
    ['FADING AT 12:25', fading1225],
    ['REVERSAL DAYS', reversalRows],
    ['REVERSAL + FADING 12:25', revFade1225],
    ['DEEP FADE >3p', deep],
  ] as const) {
    const stats = computeEntryStats(group, 'A');
    if (stats.avgByExit.p1300 > bestSubgroup.avg) {
      bestSubgroup = { name, avg: stats.avgByExit.p1300, pct3p: stats.pct3pByExit.p1300, n: stats.n };
    }
  }

  console.log('\n── KEY FINDINGS ──');
  console.log(
    `Entry A (12:25) best exit: ${bestA.label} at avg ${bestA.avg}p (${bestA.pctPos}% positive)`,
  );
  console.log(
    `Entry B (12:30) best exit: ${bestB.label} at avg ${bestB.avg}p (${bestB.pctPos}% positive)`,
  );
  console.log(
    `Fading condition improves avg pips by: +${Math.round((fadeA.avgByExit.p1300 - allA.avgByExit.p1300) * 10) / 10}p vs all days`,
  );
  console.log(
    `Reversal days avg at 13:00: Entry A ${revA.avgByExit.p1300}p | Entry B ${revB.avgByExit.p1300}p`,
  );
  console.log(
    `Best subgroup: ${bestSubgroup.name} at avg ${bestSubgroup.avg}p, ${bestSubgroup.pct3p}% >=3p (n=${bestSubgroup.n})`,
  );
  console.log(
    `Spread breakeven (1.5p): Entry A reaches at ${spreadBreakevenExit(allA, 1.5)} | ` +
    `Entry B reaches at ${spreadBreakevenExit(allB, 1.5)}`,
  );

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputPath = path.join(process.cwd(), 'scripts/output', `amd_probe_entry_backtest_${stamp}.csv`);
  writeDetailCsv(dayRows, outputPath);
  console.log(`\nDetail CSV: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
