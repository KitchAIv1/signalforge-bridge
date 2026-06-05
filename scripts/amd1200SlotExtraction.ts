/**
 * 12:00–13:00 slot ground truth extraction — raw per-day behavior, no assumptions.
 * READ-ONLY research — reads amd_m5_distribution_candles + amd_state.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amd1200SlotExtraction.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';
const PEAK_TIMES = Array.from({ length: 12 }, (_, index) => {
  const totalMinutes = 720 + index * 5;
  const hh = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const mm = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
});

type Dir = 'UP' | 'DOWN' | 'FLAT';
type MoveSize = 'LARGE' | 'MEDIUM' | 'SMALL' | 'MICRO';
type M5RawCandle = { o: string; h: string; l: string; c: string; time?: string };

type StateRow = {
  trade_date: string;
  amd_tag: string | null;
  amd_outcome_tag: string | null;
  judas_direction: string | null;
  judas_pips: number | null;
  decision_auto_direction: string | null;
  auto_direction_confidence: string | null;
  m5_vs_judas_direction: string | null;
  m5_momentum_type: string | null;
  daily_bias_alignment: string | null;
  layer4_d1_bias: string | null;
  layer4_bullish_count: number | null;
  layer4_bearish_count: number | null;
  accumulation_quality_score: number | null;
  asian_range_pips: number | null;
  asian_close_bias_signal: string | null;
};

type FirstMoveDir = 'UP' | 'DOWN' | 'TIED';
type ReversalType = 'CONTINUATION' | 'STALLED' | 'REVERSAL' | 'MIXED';

type SlotMetrics = {
  open_1200: number;
  close_1300: number;
  net_pips: number;
  candle_direction: Dir;
  peak_up_pips: number;
  peak_up_time: string;
  peak_up_candle_idx: number;
  peak_down_pips: number;
  peak_down_time: string;
  peak_down_candle_idx: number;
  dominant_direction: Dir;
  total_range: number;
  real_move_pips: number;
  real_move_time: string;
  move_size: MoveSize;
  close_confirms_dominant: boolean;
  judas_inverted: Dir | null;
  dominant_agrees_judas_inversion: boolean | null;
  first_move_direction: FirstMoveDir;
  first_move_pips: number;
  first_move_time: string;
  second_move_pips: number;
  second_move_time: string;
  had_reversal: boolean;
  reversal_pips_from_peak: number;
  reversal_depth_pips: number;
  reversal_type: ReversalType;
};

type DayRow = StateRow & SlotMetrics;

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

function peakTimeFromIndex(candleIndex: number): string {
  const totalMinutes = 720 + candleIndex * 5;
  const hh = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const mm = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function classifyMoveSize(realMovePips: number): MoveSize {
  if (realMovePips >= 10) return 'LARGE';
  if (realMovePips >= 5) return 'MEDIUM';
  if (realMovePips >= 2) return 'SMALL';
  return 'MICRO';
}

function computeReversalFields(
  open1200: number,
  close1300: number,
  netPips: number,
  candleDirection: Dir,
  peakUpPips: number,
  peakUpTime: string,
  peakUpCandleIdx: number,
  peakDownPips: number,
  peakDownTime: string,
  peakDownCandleIdx: number,
): Pick<
  SlotMetrics,
  | 'first_move_direction' | 'first_move_pips' | 'first_move_time'
  | 'second_move_pips' | 'second_move_time'
  | 'had_reversal' | 'reversal_pips_from_peak' | 'reversal_depth_pips' | 'reversal_type'
> {
  const firstMoveDirection: FirstMoveDir =
    peakUpCandleIdx < peakDownCandleIdx ? 'UP'
      : peakDownCandleIdx < peakUpCandleIdx ? 'DOWN' : 'TIED';

  const firstMovePips =
    firstMoveDirection === 'UP' ? peakUpPips
      : firstMoveDirection === 'DOWN' ? peakDownPips : 0;
  const firstMoveTime =
    firstMoveDirection === 'UP' ? peakUpTime
      : firstMoveDirection === 'DOWN' ? peakDownTime : '12:00';
  const secondMovePips =
    firstMoveDirection === 'UP' ? peakDownPips
      : firstMoveDirection === 'DOWN' ? peakUpPips : 0;
  const secondMoveTime =
    firstMoveDirection === 'UP' ? peakDownTime
      : firstMoveDirection === 'DOWN' ? peakUpTime : '12:00';

  const firstMoveThreshold = 3;
  const hadReversal =
    firstMovePips >= firstMoveThreshold
    && secondMovePips >= firstMoveThreshold
    && (
      (firstMoveDirection === 'UP' && netPips < -1)
      || (firstMoveDirection === 'DOWN' && netPips > 1)
    );

  const reversalPipsFromPeak =
    firstMoveDirection === 'UP'
      ? Math.round((open1200 + peakUpPips / 10000 - close1300) * 10000 * 10) / 10
      : firstMoveDirection === 'DOWN'
        ? Math.round((close1300 - (open1200 - peakDownPips / 10000)) * 10000 * 10) / 10
        : 0;

  const reversalDepthPips =
    firstMoveDirection === 'UP'
      ? Math.round((firstMovePips + Math.abs(Math.min(netPips, 0))) * 10) / 10
      : firstMoveDirection === 'DOWN'
        ? Math.round((firstMovePips + Math.abs(Math.max(netPips, 0))) * 10) / 10
        : 0;

  const reversalType: ReversalType =
    !hadReversal && firstMoveDirection === candleDirection ? 'CONTINUATION'
      : !hadReversal && candleDirection === 'FLAT' ? 'STALLED'
        : hadReversal ? 'REVERSAL'
          : 'MIXED';

  return {
    first_move_direction: firstMoveDirection,
    first_move_pips: firstMovePips,
    first_move_time: firstMoveTime,
    second_move_pips: secondMovePips,
    second_move_time: secondMoveTime,
    had_reversal: hadReversal,
    reversal_pips_from_peak: reversalPipsFromPeak,
    reversal_depth_pips: reversalDepthPips,
    reversal_type: reversalType,
  };
}

function firstMoveBucket(firstMoveTime: string): string {
  const [hh, mm] = firstMoveTime.split(':').map(Number);
  const minutes = hh * 60 + mm;
  if (minutes <= 735) return '12:00-12:15';
  if (minutes <= 750) return '12:15-12:30';
  if (minutes <= 765) return '12:30-12:45';
  return '12:45-12:55';
}

function extractSlotMetrics(
  candles: M5RawCandle[],
  judasDir: string | null,
): SlotMetrics | null {
  const slot = candles.slice(24, 36);
  if (slot.length < 12) return null;

  const open1200 = parseFloat(slot[0].o);
  const close1300 = parseFloat(slot[slot.length - 1].c);
  const netPips = Math.round((close1300 - open1200) * 10000 * 10) / 10;
  const candleDirection: Dir = netPips > 1 ? 'UP' : netPips < -1 ? 'DOWN' : 'FLAT';

  let peakUpPips = 0;
  let peakUpTime = '12:00';
  let peakUpCandleIdx = 0;
  let peakDownPips = 0;
  let peakDownTime = '12:00';
  let peakDownCandleIdx = 0;

  for (let index = 0; index < slot.length; index += 1) {
    const high = parseFloat(slot[index].h);
    const low = parseFloat(slot[index].l);
    const up = Math.round((high - open1200) * 10000 * 10) / 10;
    const down = Math.round((open1200 - low) * 10000 * 10) / 10;

    if (up > peakUpPips) {
      peakUpPips = up;
      peakUpCandleIdx = index;
      peakUpTime = peakTimeFromIndex(index);
    }
    if (down > peakDownPips) {
      peakDownPips = down;
      peakDownCandleIdx = index;
      peakDownTime = peakTimeFromIndex(index);
    }
  }

  const dominantDirection: Dir = peakUpPips > peakDownPips ? 'UP'
    : peakDownPips > peakUpPips ? 'DOWN' : 'FLAT';
  const totalRange = Math.round((peakUpPips + peakDownPips) * 10) / 10;
  const realMovePips = Math.max(peakUpPips, peakDownPips);
  const realMoveTime = dominantDirection === 'UP' ? peakUpTime : peakDownTime;
  const moveSize = classifyMoveSize(realMovePips);
  const closeConfirmsDominant = dominantDirection === 'UP' ? netPips > 1
    : dominantDirection === 'DOWN' ? netPips < -1 : false;

  const judasInverted: Dir | null = judasDir === 'UP' ? 'DOWN'
    : judasDir === 'DOWN' ? 'UP' : null;
  const dominantAgreesJudas = judasInverted != null
    ? dominantDirection === judasInverted
    : null;

  const reversalFields = computeReversalFields(
    open1200,
    close1300,
    netPips,
    candleDirection,
    peakUpPips,
    peakUpTime,
    peakUpCandleIdx,
    peakDownPips,
    peakDownTime,
    peakDownCandleIdx,
  );

  return {
    open_1200: open1200,
    close_1300: close1300,
    net_pips: netPips,
    candle_direction: candleDirection,
    peak_up_pips: peakUpPips,
    peak_up_time: peakUpTime,
    peak_up_candle_idx: peakUpCandleIdx,
    peak_down_pips: peakDownPips,
    peak_down_time: peakDownTime,
    peak_down_candle_idx: peakDownCandleIdx,
    dominant_direction: dominantDirection,
    total_range: totalRange,
    real_move_pips: realMovePips,
    real_move_time: realMoveTime,
    move_size: moveSize,
    close_confirms_dominant: closeConfirmsDominant,
    judas_inverted: judasInverted,
    dominant_agrees_judas_inversion: dominantAgreesJudas,
    ...reversalFields,
  };
}

function printPeakTiming(title: string, rows: DayRow[], timeField: 'peak_up_time' | 'peak_down_time'): void {
  console.log(`\n── ${title} ──`);
  console.log('When price peaked — what time?');
  for (const timeLabel of PEAK_TIMES) {
    const count = rows.filter((row) => row[timeField] === timeLabel).length;
    console.log(`${timeLabel}: ${count} days (${pct(count, rows.length)}%)`);
  }
}

function printTagSummary(tag: string, rows: DayRow[]): void {
  const tagged = rows.filter((row) => row.amd_outcome_tag === tag);
  if (tagged.length === 0) return;
  const upDominant = tagged.filter((row) => row.dominant_direction === 'UP').length;
  const downDominant = tagged.filter((row) => row.dominant_direction === 'DOWN').length;
  const confirms = tagged.filter((row) => row.close_confirms_dominant).length;
  const shortTag = tag.replace('AMD_', '').replace('_BREAKOUT', '');
  console.log(`\n${shortTag} (n=${tagged.length}):`);
  console.log(
    `  UP dominant: ${pct(upDominant, tagged.length)}% | DOWN dominant: ${pct(downDominant, tagged.length)}%`,
  );
  console.log(
    `  Avg real move: ${avg(tagged.map((row) => row.real_move_pips))}p | Avg net: ${avg(tagged.map((row) => row.net_pips))}p`,
  );
  console.log(`  Close confirms dominant: ${pct(confirms, tagged.length)}%`);
}

function printReversalAnalysis(rows: DayRow[]): void {
  const total = rows.length;
  const upThenDown = rows.filter((row) => row.had_reversal && row.first_move_direction === 'UP').length;
  const downThenUp = rows.filter((row) => row.had_reversal && row.first_move_direction === 'DOWN').length;
  const continuation = rows.filter((row) => row.reversal_type === 'CONTINUATION').length;
  const stalled = rows.filter((row) => row.reversal_type === 'STALLED').length;
  const hadReversal = rows.filter((row) => row.had_reversal).length;

  console.log('\n── REVERSAL ANALYSIS ──');
  console.log(`First move UP then reversed DOWN:  ${upThenDown} days (${pct(upThenDown, total)}%)`);
  console.log(`First move DOWN then reversed UP:  ${downThenUp} days (${pct(downThenUp, total)}%)`);
  console.log(`No reversal (continuation):        ${continuation} days (${pct(continuation, total)}%)`);
  console.log(`Stalled (flat close):              ${stalled} days (${pct(stalled, total)}%)`);
  console.log(`\nHad reversal (first move ≥3p, close opposite side): ${hadReversal}/${total} (${pct(hadReversal, total)}%)`);

  console.log('\nReversal by AMD outcome tag:');
  for (const tag of [
    'AMD_TEXTBOOK',
    'AMD_COMPRESSION_BREAKOUT',
    'AMD_FAILED',
    'AMD_SHIFTED',
    'AMD_NONE',
  ]) {
    const tagged = rows.filter((row) => row.amd_outcome_tag === tag);
    if (tagged.length === 0) continue;
    const shortTag = tag.replace('AMD_', '').replace('_BREAKOUT', '').padEnd(11);
    const tagReversals = tagged.filter((row) => row.had_reversal).length;
    console.log(
      `  ${shortTag}: ${pct(tagReversals, tagged.length)}% had reversal | ` +
      `avg first move: ${avg(tagged.map((row) => row.first_move_pips))}p | ` +
      `avg reversal depth: ${avg(tagged.filter((row) => row.had_reversal).map((row) => row.reversal_depth_pips))}p`,
    );
  }

  console.log('\nPeak timing — first move peak:');
  for (const bucket of ['12:00-12:15', '12:15-12:30', '12:30-12:45', '12:45-12:55']) {
    const count = rows.filter((row) => firstMoveBucket(row.first_move_time) === bucket).length;
    const suffix = bucket === '12:00-12:15' ? '  ← immediate move'
      : bucket === '12:45-12:55' ? '  ← late move' : '';
    console.log(`  ${bucket}: ${count} days (${pct(count, total)}%)${suffix}`);
  }

  const reversalRows = rows.filter((row) => row.had_reversal);
  const continuationRows = rows.filter((row) => row.reversal_type === 'CONTINUATION');
  console.log(
    `\nOn REVERSAL days: avg first_move_pips = ${avg(reversalRows.map((row) => row.first_move_pips))}p | ` +
    `avg reversal_depth_pips = ${avg(reversalRows.map((row) => row.reversal_depth_pips))}p`,
  );
  console.log(
    `On CONTINUATION days: avg first_move_pips = ${avg(continuationRows.map((row) => row.first_move_pips))}p`,
  );
}

function writeDetailCsv(rows: DayRow[], outputPath: string): void {
  const header = [
    'trade_date',
    'amd_tag', 'amd_outcome_tag',
    'judas_direction', 'judas_pips',
    'decision_auto_direction', 'auto_direction_confidence',
    'm5_vs_judas_direction', 'm5_momentum_type',
    'daily_bias_alignment', 'layer4_d1_bias', 'layer4_bullish_count',
    'accumulation_quality_score', 'asian_range_pips', 'asian_close_bias_signal',
    'open_1200', 'close_1300',
    'net_pips', 'candle_direction',
    'peak_up_pips', 'peak_up_time',
    'peak_down_pips', 'peak_down_time',
    'dominant_direction', 'total_range', 'real_move_pips', 'real_move_time',
    'move_size', 'close_confirms_dominant',
    'judas_inverted', 'dominant_agrees_judas_inversion',
    'first_move_direction', 'first_move_pips', 'first_move_time',
    'second_move_pips', 'second_move_time',
    'had_reversal', 'reversal_depth_pips', 'reversal_type',
  ].join(',');

  const lines = rows.map((row) => [
    row.trade_date,
    row.amd_tag ?? '', row.amd_outcome_tag ?? '',
    row.judas_direction ?? '', row.judas_pips ?? '',
    row.decision_auto_direction ?? '', row.auto_direction_confidence ?? '',
    row.m5_vs_judas_direction ?? '', row.m5_momentum_type ?? '',
    row.daily_bias_alignment ?? '', row.layer4_d1_bias ?? '', row.layer4_bullish_count ?? '',
    row.accumulation_quality_score ?? '', row.asian_range_pips ?? '', row.asian_close_bias_signal ?? '',
    row.open_1200, row.close_1300,
    row.net_pips, row.candle_direction,
    row.peak_up_pips, row.peak_up_time,
    row.peak_down_pips, row.peak_down_time,
    row.dominant_direction, row.total_range, row.real_move_pips, row.real_move_time,
    row.move_size, row.close_confirms_dominant,
    row.judas_inverted ?? '', row.dominant_agrees_judas_inversion ?? '',
    row.first_move_direction, row.first_move_pips, row.first_move_time,
    row.second_move_pips, row.second_move_time,
    row.had_reversal, row.reversal_depth_pips, row.reversal_type,
  ].join(','));

  fs.writeFileSync(outputPath, [header, ...lines].join('\n') + '\n');
}

async function main(): Promise<void> {
  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

  const { data: candleRows, error: candleErr } = await supabase
    .from('amd_m5_distribution_candles')
    .select('trade_date, candles, candle_count')
    .eq('pair', PAIR)
    .eq('fetch_status', 'success')
    .order('trade_date', { ascending: true });

  if (candleErr || !candleRows) {
    throw new Error(`M5 fetch failed: ${candleErr?.message ?? 'no data'}`);
  }

  const { data: stateRows, error: stateErr } = await supabase
    .from('amd_state')
    .select(`
      trade_date, amd_tag, amd_outcome_tag,
      judas_direction, judas_pips,
      decision_auto_direction, auto_direction_confidence,
      m5_vs_judas_direction, m5_momentum_type,
      daily_bias_alignment, layer4_d1_bias,
      layer4_bullish_count, layer4_bearish_count,
      accumulation_quality_score, asian_range_pips,
      asian_close_bias_signal
    `)
    .eq('pair', PAIR)
    .order('trade_date', { ascending: true });

  if (stateErr || !stateRows) {
    throw new Error(`amd_state fetch failed: ${stateErr?.message ?? 'no data'}`);
  }

  const stateByDate = new Map<string, StateRow>();
  for (const row of stateRows as StateRow[]) {
    stateByDate.set(row.trade_date, row);
  }

  const dayRows: DayRow[] = [];
  let skipped = 0;

  for (const candleRow of candleRows) {
    const tradeDate = candleRow.trade_date as string;
    const candles = candleRow.candles as M5RawCandle[];
    const stateRow = stateByDate.get(tradeDate);
    const metrics = candles ? extractSlotMetrics(candles, stateRow?.judas_direction ?? null) : null;

    if (!metrics) {
      skipped += 1;
      continue;
    }

    dayRows.push({
      trade_date: tradeDate,
      amd_tag: stateRow?.amd_tag ?? null,
      amd_outcome_tag: stateRow?.amd_outcome_tag ?? null,
      judas_direction: stateRow?.judas_direction ?? null,
      judas_pips: stateRow?.judas_pips ?? null,
      decision_auto_direction: stateRow?.decision_auto_direction ?? null,
      auto_direction_confidence: stateRow?.auto_direction_confidence ?? null,
      m5_vs_judas_direction: stateRow?.m5_vs_judas_direction ?? null,
      m5_momentum_type: stateRow?.m5_momentum_type ?? null,
      daily_bias_alignment: stateRow?.daily_bias_alignment ?? null,
      layer4_d1_bias: stateRow?.layer4_d1_bias ?? null,
      layer4_bullish_count: stateRow?.layer4_bullish_count ?? null,
      layer4_bearish_count: stateRow?.layer4_bearish_count ?? null,
      accumulation_quality_score: stateRow?.accumulation_quality_score ?? null,
      asian_range_pips: stateRow?.asian_range_pips ?? null,
      asian_close_bias_signal: stateRow?.asian_close_bias_signal ?? null,
      ...metrics,
    });
  }

  const total = dayRows.length;
  const netUp = dayRows.filter((row) => row.candle_direction === 'UP').length;
  const netDown = dayRows.filter((row) => row.candle_direction === 'DOWN').length;
  const netFlat = dayRows.filter((row) => row.candle_direction === 'FLAT').length;
  const domUp = dayRows.filter((row) => row.dominant_direction === 'UP').length;
  const domDown = dayRows.filter((row) => row.dominant_direction === 'DOWN').length;
  const largeCount = dayRows.filter((row) => row.move_size === 'LARGE').length;
  const mediumCount = dayRows.filter((row) => row.move_size === 'MEDIUM').length;
  const smallCount = dayRows.filter((row) => row.move_size === 'SMALL').length;
  const microCount = dayRows.filter((row) => row.move_size === 'MICRO').length;
  const confirms = dayRows.filter((row) => row.close_confirms_dominant).length;

  console.log('=== 12:00-13:00 SLOT EXTRACTION — GROUND TRUTH ===');
  console.log(`${total} days | AUDUSD M5 | Raw behavior, no assumptions`);

  console.log('\n── DISTRIBUTION SUMMARY ──');
  console.log(`Total days extracted: ${total}`);
  console.log(`Skipped (incomplete candles): ${skipped}`);
  console.log('\nDirection (net close vs 12:00 open):');
  console.log(`  UP:   ${netUp} days (${pct(netUp, total)}%)`);
  console.log(`  DOWN: ${netDown} days (${pct(netDown, total)}%)`);
  console.log(`  FLAT: ${netFlat} days (${pct(netFlat, total)}%)`);
  console.log('\nDominant side (larger excursion):');
  console.log(`  UP:   ${domUp} days (${pct(domUp, total)}%)`);
  console.log(`  DOWN: ${domDown} days (${pct(domDown, total)}%)`);
  console.log('\nMove size distribution (dominant side):');
  console.log(`  LARGE  (≥10p): ${largeCount} days (${pct(largeCount, total)}%)`);
  console.log(`  MEDIUM (5-9p): ${mediumCount} days (${pct(mediumCount, total)}%)`);
  console.log(`  SMALL  (2-4p): ${smallCount} days (${pct(smallCount, total)}%)`);
  console.log(`  MICRO  (<2p):  ${microCount} days (${pct(microCount, total)}%)`);
  console.log(`\nClose confirms dominant direction: ${confirms}/${total} (${pct(confirms, total)}%)`);

  console.log('\n── AVERAGES ──');
  console.log(`Avg peak UP from 12:00 open:   ${avg(dayRows.map((row) => row.peak_up_pips))}p`);
  console.log(`Avg peak DOWN from 12:00 open: ${avg(dayRows.map((row) => row.peak_down_pips))}p`);
  console.log(`Avg net pips (close-open):     ${avg(dayRows.map((row) => row.net_pips))}p`);
  console.log(`Avg total range:               ${avg(dayRows.map((row) => row.total_range))}p`);
  console.log(`Avg real move (dominant side): ${avg(dayRows.map((row) => row.real_move_pips))}p`);

  printPeakTiming('PEAK TIMING — UP EXCURSION', dayRows, 'peak_up_time');
  printPeakTiming('PEAK TIMING — DOWN EXCURSION', dayRows, 'peak_down_time');

  console.log('\n── BY AMD OUTCOME TAG ──');
  for (const tag of [
    'AMD_TEXTBOOK',
    'AMD_COMPRESSION_BREAKOUT',
    'AMD_FAILED',
    'AMD_SHIFTED',
    'AMD_NONE',
  ]) {
    printTagSummary(tag, dayRows);
  }

  printReversalAnalysis(dayRows);

  const largeRows = dayRows.filter((row) => row.move_size === 'LARGE');
  const largeUp = largeRows.filter((row) => row.dominant_direction === 'UP').length;
  const largeDown = largeRows.filter((row) => row.dominant_direction === 'DOWN').length;
  const largeJudasAgree = largeRows.filter((row) => row.dominant_agrees_judas_inversion === true).length;
  const largeJudasScorable = largeRows.filter((row) => row.dominant_agrees_judas_inversion != null).length;

  console.log('\n── LARGE MOVES (≥10p real move) ──');
  console.log(`Count: ${largeRows.length} days (${pct(largeRows.length, total)}% of all days)`);
  console.log(`UP large: ${largeUp} | DOWN large: ${largeDown}`);
  console.log('AMD tag distribution among large days:');
  for (const tag of ['AMD_TEXTBOOK', 'AMD_COMPRESSION_BREAKOUT', 'AMD_FAILED', 'AMD_SHIFTED', 'AMD_NONE']) {
    const shortTag = tag.replace('AMD_', '').replace('_BREAKOUT', '');
    const count = largeRows.filter((row) => row.amd_outcome_tag === tag).length;
    console.log(`  ${shortTag}: ${count}`);
  }
  console.log(`Judas inversion agreement on large days: ${pct(largeJudasAgree, largeJudasScorable)}%`);

  const judasScorable = dayRows.filter((row) => row.dominant_agrees_judas_inversion != null);
  const judasAgree = judasScorable.filter((row) => row.dominant_agrees_judas_inversion === true).length;

  console.log('\n── JUDAS INVERSION ALIGNMENT ──');
  console.log(
    `Dominant direction agrees with Judas inversion: ${judasAgree}/${judasScorable.length} (${pct(judasAgree, judasScorable.length)}%)`,
  );
  for (const size of ['LARGE', 'MEDIUM', 'SMALL'] as const) {
    const sizeRows = dayRows.filter((row) => row.move_size === size && row.dominant_agrees_judas_inversion != null);
    const sizeAgree = sizeRows.filter((row) => row.dominant_agrees_judas_inversion === true).length;
    console.log(`On ${size} moves: ${pct(sizeAgree, sizeRows.length)}%`);
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputPath = path.join(
    process.cwd(),
    'scripts/output',
    `amd_1200_slot_ground_truth_${stamp}.csv`,
  );
  writeDetailCsv(dayRows, outputPath);
  console.log(`\nDetail CSV: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
