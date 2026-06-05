/**
 * AGREE entry timing backtest — current AMD entry vs 12:25, advisory layer filters.
 * READ-ONLY research — ground truth CSV + amd_m5_distribution_candles.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amdAgreeEntryTimingBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';
type Dir = 'UP' | 'DOWN';
type M5RawCandle = { o: string; h: string; l: string; c: string; time?: string };

type AdvisoryFlags = {
  high_qual: boolean;
  very_high_qual: boolean;
  sustained: boolean;
  reversed: boolean;
  against_judas_sustained: boolean;
  with_judas: boolean;
  high_conf: boolean;
  qual_score: number;
};

type AgreeDayRow = {
  trade_date: string;
  outcomeTag: string;
  agreeDir: Dir;
  flags: AdvisoryFlags;
  m5Signal: string;
  momentumType: string;
  confidence: string;
  currentEntryIdx: number;
  currentEntryPrice: number;
  currentPips: number;
  currentMfe: number;
  currentMae: number;
  entry1225Price: number;
  newPips: number;
  newMfe: number;
  newMae: number;
  pipDelta: number;
};

type EntryStats = {
  n: number;
  avg_pips: number;
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

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function loadGroundTruthCsv(): {
  csvRows: string[][];
  col: (row: string[], name: string) => string;
} {
  const csvPath = path.join(__dirname, 'output/amd_1200_slot_ground_truth_20260605.csv');
  const csvLines = fs.readFileSync(csvPath, 'utf8').split('\n');
  const csvHeader = csvLines[0].split(',');
  const csvRows = csvLines.slice(1).filter(Boolean).map((line) => line.split(','));
  const col = (row: string[], name: string) => row[csvHeader.indexOf(name)] ?? '';
  return { csvRows, col };
}

function isAgree(row: string[], col: (r: string[], n: string) => string): boolean {
  const dir = col(row, 'decision_auto_direction');
  const asian = col(row, 'asian_close_bias_signal');
  if (dir !== 'long' && dir !== 'short') return false;
  if (dir === 'long' && asian === 'BULLISH') return true;
  if (dir === 'short' && asian === 'BEARISH') return true;
  return false;
}

function agreeDirection(row: string[], col: (r: string[], n: string) => string): Dir {
  return col(row, 'decision_auto_direction') === 'long' ? 'UP' : 'DOWN';
}

function advisoryFlags(row: string[], col: (r: string[], n: string) => string): AdvisoryFlags {
  const qual = parseFloat(col(row, 'accumulation_quality_score')) || 0;
  const m5 = col(row, 'm5_vs_judas_direction');
  const mom = col(row, 'm5_momentum_type');
  const conf = col(row, 'auto_direction_confidence');
  return {
    high_qual: qual >= 0.65,
    very_high_qual: qual >= 0.80,
    sustained: mom === 'SUSTAINED',
    reversed: mom === 'REVERSED',
    against_judas_sustained: m5 === 'AGAINST_JUDAS' && mom === 'SUSTAINED',
    with_judas: m5 === 'WITH_JUDAS',
    high_conf: conf === 'high',
    qual_score: qual,
  };
}

function currentEntryIndex(outcomeTag: string): number {
  if (outcomeTag === 'AMD_COMPRESSION_BREAKOUT' || outcomeTag === 'AMD_NONE') return 6;
  if (outcomeTag === 'AMD_FAILED') return 12;
  return 24;
}

function pipCapture(entry: number, exit: number, dir: Dir): number {
  const raw = dir === 'UP' ? (exit - entry) * 10000 : (entry - exit) * 10000;
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
  if (dir === 'UP') {
    const highestHigh = Math.max(...window.map((c) => parseFloat(c.h)));
    return Math.round((highestHigh - entry) * 10000 * 10) / 10;
  }
  const lowestLow = Math.min(...window.map((c) => parseFloat(c.l)));
  return Math.round((entry - lowestLow) * 10000 * 10) / 10;
}

function mae(
  entry: number,
  candles: M5RawCandle[],
  fromIdx: number,
  toIdx: number,
  dir: Dir,
): number {
  const window = candles.slice(fromIdx, toIdx + 1);
  if (dir === 'UP') {
    const lowestLow = Math.min(...window.map((c) => parseFloat(c.l)));
    return Math.round((entry - lowestLow) * 10000 * 10) / 10;
  }
  const highestHigh = Math.max(...window.map((c) => parseFloat(c.h)));
  return Math.round((entry - highestHigh) * 10000 * 10) / 10;
}

function computeEntryStats(rows: AgreeDayRow[], field: 'current' | 'new'): EntryStats {
  const pipsKey = field === 'current' ? 'currentPips' : 'newPips';
  const mfeKey = field === 'current' ? 'currentMfe' : 'newMfe';
  const maeKey = field === 'current' ? 'currentMae' : 'newMae';
  const pips = rows.map((row) => row[pipsKey]);
  return {
    n: rows.length,
    avg_pips: avg(pips),
    pct_positive: pct(pips.filter((value) => value > 0).length, pips.length),
    pct_3p: pct(pips.filter((value) => value >= 3).length, pips.length),
    pct_5p: pct(pips.filter((value) => value >= 5).length, pips.length),
    avg_mfe: avg(rows.map((row) => row[mfeKey])),
    avg_mae: avg(rows.map((row) => row[maeKey])),
  };
}

function buildAgreeDay(
  csvRow: string[],
  candles: M5RawCandle[],
  col: (row: string[], name: string) => string,
): AgreeDayRow {
  const dir = agreeDirection(csvRow, col);
  const outcomeTag = col(csvRow, 'amd_outcome_tag');
  const entryIdx = currentEntryIndex(outcomeTag);
  const exit1300 = parseFloat(candles[35].c);
  const currentEntry = parseFloat(candles[entryIdx].o);
  const entry1225 = parseFloat(candles[29].o);
  const flags = advisoryFlags(csvRow, col);

  const currentPips = pipCapture(currentEntry, exit1300, dir);
  const newPips = pipCapture(entry1225, exit1300, dir);

  return {
    trade_date: col(csvRow, 'trade_date'),
    outcomeTag,
    agreeDir: dir,
    flags,
    m5Signal: col(csvRow, 'm5_vs_judas_direction'),
    momentumType: col(csvRow, 'm5_momentum_type'),
    confidence: col(csvRow, 'auto_direction_confidence'),
    currentEntryIdx: entryIdx,
    currentEntryPrice: currentEntry,
    currentPips,
    currentMfe: mfe(currentEntry, candles, entryIdx, 35, dir),
    currentMae: mae(currentEntry, candles, entryIdx, 35, dir),
    entry1225Price: entry1225,
    newPips,
    newMfe: mfe(entry1225, candles, 29, 35, dir),
    newMae: mae(entry1225, candles, 29, 35, dir),
    pipDelta: Math.round((newPips - currentPips) * 10) / 10,
  };
}

function printStatsRow(label: string, stats: EntryStats): void {
  console.log(
    `${label.padEnd(17)} | ${String(stats.n).padStart(3)} | ` +
    `${String(stats.avg_pips).padStart(6)}p | ${String(stats.pct_positive).padStart(4)}% | ` +
    `${String(stats.pct_3p).padStart(5)}% | ${String(stats.pct_5p).padStart(5)}% | ` +
    `${String(stats.avg_mfe).padStart(4)}p | ${String(stats.avg_mae).padStart(4)}p`,
  );
}

function printAdvisoryRow(label: string, rows: AgreeDayRow[]): void {
  const stats = computeEntryStats(rows, 'new');
  console.log(
    `${label.padEnd(25)} | ${String(stats.n).padStart(2)} | ` +
    `${String(stats.avg_pips).padStart(6)}p | ${String(stats.pct_positive).padStart(4)}% | ` +
    `${String(stats.pct_3p).padStart(5)}% | ${String(stats.pct_5p).padStart(5)}% | ${stats.avg_mfe}p`,
  );
}

function writeDetailCsv(rows: AgreeDayRow[], outputPath: string): void {
  const header = [
    'trade_date', 'amd_outcome_tag', 'agree_dir',
    'qual_score', 'm5_signal', 'momentum_type', 'confidence',
    'high_qual', 'sustained', 'reversed', 'against_judas_sustained',
    'current_entry_idx', 'current_entry_price', 'current_pips', 'current_mfe', 'current_mae',
    'entry1225_price', 'new_pips', 'new_mfe', 'new_mae', 'pip_delta',
  ].join(',');

  const lines = rows.map((row) => [
    row.trade_date, row.outcomeTag, row.agreeDir,
    row.flags.qual_score, row.m5Signal, row.momentumType, row.confidence,
    row.flags.high_qual, row.flags.sustained, row.flags.reversed, row.flags.against_judas_sustained,
    row.currentEntryIdx, row.currentEntryPrice, row.currentPips, row.currentMfe, row.currentMae,
    row.entry1225Price, row.newPips, row.newMfe, row.newMae, row.pipDelta,
  ].join(','));

  fs.writeFileSync(outputPath, [header, ...lines].join('\n') + '\n');
}

async function main(): Promise<void> {
  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const { csvRows, col } = loadGroundTruthCsv();
  const totalDays = csvRows.length;

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

  const agreeDays: AgreeDayRow[] = [];
  let longBullish = 0;
  let shortBearish = 0;

  for (const csvRow of csvRows) {
    if (!isAgree(csvRow, col)) continue;
    const tradeDate = col(csvRow, 'trade_date');
    const candles = candlesByDate.get(tradeDate);
    if (!candles || candles.length < 36) continue;

    const dir = col(csvRow, 'decision_auto_direction');
    if (dir === 'long') longBullish += 1;
    if (dir === 'short') shortBearish += 1;

    agreeDays.push(buildAgreeDay(csvRow, candles, col));
  }

  const groups: Record<string, AgreeDayRow[]> = {
    ALL_AGREE: agreeDays,
    HIGH_QUAL: agreeDays.filter((day) => day.flags.high_qual),
    VERY_HIGH_QUAL: agreeDays.filter((day) => day.flags.very_high_qual),
    SUSTAINED: agreeDays.filter((day) => day.flags.sustained),
    REVERSED: agreeDays.filter((day) => day.flags.reversed),
    AGAINST_JUDAS_SUSTAINED: agreeDays.filter((day) => day.flags.against_judas_sustained),
    WITH_JUDAS: agreeDays.filter((day) => day.flags.with_judas),
    HIGH_CONF: agreeDays.filter((day) => day.flags.high_conf),
    HIGH_QUAL_SUSTAINED: agreeDays.filter((day) => day.flags.high_qual && day.flags.sustained),
    TEXTBOOK: agreeDays.filter((day) => day.outcomeTag === 'AMD_TEXTBOOK'),
    COMPRESSION: agreeDays.filter((day) => day.outcomeTag === 'AMD_COMPRESSION_BREAKOUT'),
    FAILED: agreeDays.filter((day) => day.outcomeTag === 'AMD_FAILED'),
    SHIFTED: agreeDays.filter((day) => day.outcomeTag === 'AMD_SHIFTED'),
  };

  console.log('=== AGREE ENTRY TIMING BACKTEST ===');
  console.log('AGREE gate: decision_auto_direction non-neutral + asian_close_bias AGREE');
  console.log('Comparing: current AMD entry timing vs new 12:25 entry');
  console.log('Exit: 13:00 UTC close for all');

  console.log('\n── AGREE POPULATION ──');
  console.log(`Total AGREE days: ${agreeDays.length} / ${totalDays} (${pct(agreeDays.length, totalDays)}%)`);
  console.log(`  Long + BULLISH: ${longBullish} days`);
  console.log(`  Short + BEARISH: ${shortBearish} days`);
  console.log('By outcome tag:');
  for (const tag of ['AMD_TEXTBOOK', 'AMD_COMPRESSION_BREAKOUT', 'AMD_FAILED', 'AMD_SHIFTED', 'AMD_NONE']) {
    const count = agreeDays.filter((day) => day.outcomeTag === tag).length;
    const shortTag = tag.replace('AMD_', '').replace('_BREAKOUT', '');
    console.log(`  ${shortTag}: ${count}`);
  }

  const currentAll = computeEntryStats(agreeDays, 'current');
  const newAll = computeEntryStats(agreeDays, 'new');
  const deltas = agreeDays.map((day) => day.pipDelta);

  console.log('\n── MAIN COMPARISON — ALL AGREE DAYS ──');
  console.log('                  | N   | AvgPips | %Pos | %>=3p | %>=5p | MFE  | MAE');
  printStatsRow('Current entry', currentAll);
  printStatsRow('12:25 entry', newAll);
  console.log(
    `${'Delta (12:25-cur)'.padEnd(17)} |     | ${String(avg(deltas)).padStart(6)}p | ` +
    `${String(pct(deltas.filter((value) => value > 0).length, deltas.length)).padStart(4)}% |       |       |      |`,
  );

  console.log('\n── BY OUTCOME TAG — 12:25 vs CURRENT ──');
  console.log('TAG         | N  | Current AvgP | 12:25 AvgP | Delta | 12:25 %Pos');
  for (const [label, tag] of [
    ['TEXTBOOK', 'AMD_TEXTBOOK'],
    ['COMPRESSION', 'AMD_COMPRESSION_BREAKOUT'],
    ['FAILED', 'AMD_FAILED'],
    ['SHIFTED', 'AMD_SHIFTED'],
  ] as const) {
    const tagged = agreeDays.filter((day) => day.outcomeTag === tag);
    const cur = computeEntryStats(tagged, 'current');
    const neu = computeEntryStats(tagged, 'new');
    console.log(
      `${label.padEnd(11)} | ${String(cur.n).padStart(2)} | ${String(cur.avg_pips).padStart(11)}p | ` +
      `${String(neu.avg_pips).padStart(9)}p | ${String(avg(tagged.map((d) => d.pipDelta))).padStart(5)}p | ${neu.pct_positive}%`,
    );
  }

  console.log('\n── ADVISORY LAYER SUBGROUPS — 12:25 ENTRY ──');
  console.log('GROUP                    | N  | AvgPips | %Pos | %>=3p | %>=5p | MFE');
  printAdvisoryRow('ALL_AGREE (baseline)', agreeDays);
  printAdvisoryRow('HIGH_QUAL (>=0.65)', groups.HIGH_QUAL);
  printAdvisoryRow('VERY_HIGH_QUAL (>=0.80)', groups.VERY_HIGH_QUAL);
  printAdvisoryRow('SUSTAINED momentum', groups.SUSTAINED);
  printAdvisoryRow('REVERSED momentum', groups.REVERSED);
  printAdvisoryRow('AGAINST_JUDAS+SUSTAINED', groups.AGAINST_JUDAS_SUSTAINED);
  printAdvisoryRow('WITH_JUDAS', groups.WITH_JUDAS);
  printAdvisoryRow('HIGH_CONF', groups.HIGH_CONF);
  printAdvisoryRow('HIGH_QUAL+SUSTAINED', groups.HIGH_QUAL_SUSTAINED);

  const advisoryLabels: Record<string, AgreeDayRow[]> = {
    'HIGH_QUAL (>=0.65)': groups.HIGH_QUAL,
    'SUSTAINED momentum': groups.SUSTAINED,
    'VERY_HIGH_QUAL (>=0.80)': groups.VERY_HIGH_QUAL,
    'REVERSED momentum': groups.REVERSED,
    'AGAINST_JUDAS+SUSTAINED': groups.AGAINST_JUDAS_SUSTAINED,
    'WITH_JUDAS': groups.WITH_JUDAS,
    'HIGH_CONF': groups.HIGH_CONF,
    'HIGH_QUAL+SUSTAINED': groups.HIGH_QUAL_SUSTAINED,
  };

  let bestSubgroup = { name: 'ALL_AGREE', avg: newAll.avg_pips, n: newAll.n };
  let worstSubgroup = { name: 'ALL_AGREE', avg: newAll.avg_pips, n: newAll.n };
  for (const [name, group] of Object.entries(advisoryLabels)) {
    const stats = computeEntryStats(group, 'new');
    if (stats.n === 0) continue;
    if (stats.avg_pips > bestSubgroup.avg) {
      bestSubgroup = { name, avg: stats.avg_pips, n: stats.n };
    }
    if (stats.avg_pips < worstSubgroup.avg) {
      worstSubgroup = { name, avg: stats.avg_pips, n: stats.n };
    }
  }

  const qualImproves = computeEntryStats(groups.HIGH_QUAL, 'new').avg_pips > newAll.avg_pips;
  const sustainedImproves = computeEntryStats(groups.SUSTAINED, 'new').avg_pips > newAll.avg_pips;
  const overallDelta = Math.round((newAll.avg_pips - currentAll.avg_pips) * 10) / 10;
  const breakeven = (stats: EntryStats) => (stats.avg_pips >= 1.5 ? '13:00' : 'none');

  console.log('\n── KEY FINDINGS ──');
  console.log(`Total AGREE days: ${agreeDays.length}/${totalDays} (${pct(agreeDays.length, totalDays)}%)`);
  console.log(
    `Current entry avg pips: ${currentAll.avg_pips}p | 12:25 avg pips: ${newAll.avg_pips}p | Delta: ${overallDelta}p`,
  );
  console.log(
    `Best subgroup at 12:25: ${bestSubgroup.name} ${bestSubgroup.avg}p avg (n=${bestSubgroup.n})`,
  );
  console.log(
    `Worst subgroup at 12:25: ${worstSubgroup.name} ${worstSubgroup.avg}p avg (n=${worstSubgroup.n})`,
  );
  console.log(
    `Does 12:25 beat current timing overall? ${overallDelta > 0 ? 'YES' : 'NO'} by ${Math.abs(overallDelta)}p`,
  );
  console.log(`Does high Qual improve 12:25 results? ${qualImproves ? 'YES' : 'NO'}`);
  console.log(`Does SUSTAINED momentum improve 12:25 results? ${sustainedImproves ? 'YES' : 'NO'}`);
  console.log(
    `Spread breakeven (1.5p): current reaches ${breakeven(currentAll)} | 12:25 reaches ${breakeven(newAll)}`,
  );

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputPath = path.join(process.cwd(), 'scripts/output', `amd_agree_entry_timing_${stamp}.csv`);
  writeDetailCsv(agreeDays, outputPath);
  console.log(`\nDetail CSV: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
