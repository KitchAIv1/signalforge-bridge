/**
 * TEXTBOOK slot entry backtest — 10:31 UTC proxy filters vs 12:00–13:00 arc.
 * READ-ONLY research — reads amd_m5_distribution_candles + amd_state.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amdTextbookSlotEntryBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';

type PredictedDir = 'LONG' | 'SHORT';
type M5RawCandle = { o: string; h: string; l: string; c: string; time?: string };

type SlotDef = { label: string; startMinute: number; endMinute: number };

type SlotMetrics = {
  open: number;
  high: number;
  low: number;
  close: number;
  up_pips: number;
  down_pips: number;
  net_pips: number;
  dominant_direction: 'UP' | 'DOWN';
  candle_direction: 'UP' | 'DOWN' | 'FLAT';
};

type StateRow = {
  trade_date: string;
  amd_outcome_tag: string;
  judas_direction: string | null;
  decision_auto_direction: string | null;
  m5_vs_judas_direction: string | null;
  m5_momentum_type: string | null;
  auto_direction_confidence: string | null;
};

type TextbookSlotRow = {
  trade_date: string;
  judas_direction: string | null;
  decision_auto_direction: string | null;
  m5_vs_judas_direction: string | null;
  m5_momentum_type: string | null;
  auto_direction_confidence: string | null;
  in_filter1: boolean;
  in_filter2: boolean;
  in_filter3: boolean;
  slot_label: string;
  aligned_pips: number | null;
  opposing_pips: number | null;
  pip_edge: number | null;
  candle_aligned: boolean | null;
};

type SlotStats = {
  n: number;
  avg_aligned_pips: number;
  avg_opposing_pips: number;
  pip_edge: number;
  pct_candle_aligned: number;
  pct_candle_opposing: number;
};

const SLOTS_1H: SlotDef[] = [
  { label: '10:30-11:30', startMinute: 30, endMinute: 90 },
  { label: '11:00-12:00', startMinute: 60, endMinute: 120 },
  { label: '12:00-13:00', startMinute: 120, endMinute: 180 },
  { label: '13:00-14:00', startMinute: 180, endMinute: 240 },
  { label: '14:00-15:00', startMinute: 240, endMinute: 300 },
  { label: '15:00-16:00', startMinute: 300, endMinute: 360 },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (name === 'SUPABASE_SERVICE_ROLE_KEY' && process.env.SUPABASE_SERVICE_KEY) {
    return process.env.SUPABASE_SERVICE_KEY;
  }
  throw new Error(`Missing env: ${name}`);
}

function aggregateSlot(
  candles: M5RawCandle[],
  startIdx: number,
  endIdx: number,
): SlotMetrics | null {
  const slice = candles.slice(startIdx, endIdx);
  if (slice.length === 0) return null;

  const open = parseFloat(slice[0].o);
  const close = parseFloat(slice[slice.length - 1].c);
  const high = Math.max(...slice.map((c) => parseFloat(c.h)));
  const low = Math.min(...slice.map((c) => parseFloat(c.l)));

  const up_pips = Math.round((high - open) * 10000 * 10) / 10;
  const down_pips = Math.round((open - low) * 10000 * 10) / 10;
  const net_pips = Math.round((close - open) * 10000 * 10) / 10;

  const dominant_direction = up_pips >= down_pips ? 'UP' : 'DOWN';
  const candle_direction =
    net_pips > 0.5 ? 'UP' : net_pips < -0.5 ? 'DOWN' : 'FLAT';

  return {
    open,
    high,
    low,
    close,
    up_pips,
    down_pips,
    net_pips,
    dominant_direction,
    candle_direction,
  };
}

function slotIndices(slot: SlotDef): { startIdx: number; endIdx: number } {
  return { startIdx: slot.startMinute / 5, endIdx: slot.endMinute / 5 };
}

function judasPredicted(judasDirection: string | null): PredictedDir | null {
  if (judasDirection === 'UP') return 'SHORT';
  if (judasDirection === 'DOWN') return 'LONG';
  return null;
}

function alignedPips(
  predicted: PredictedDir | null,
  slot: SlotMetrics | null,
): number | null {
  if (!predicted || !slot) return null;
  return predicted === 'LONG' ? slot.up_pips : slot.down_pips;
}

function opposingPips(
  predicted: PredictedDir | null,
  slot: SlotMetrics | null,
): number | null {
  if (!predicted || !slot) return null;
  return predicted === 'LONG' ? slot.down_pips : slot.up_pips;
}

function candleAligned(
  predicted: PredictedDir | null,
  slot: SlotMetrics | null,
): boolean | null {
  if (!predicted || !slot) return null;
  if (slot.candle_direction === 'FLAT') return null;
  return predicted === 'LONG'
    ? slot.candle_direction === 'UP'
    : slot.candle_direction === 'DOWN';
}

function isFilter1(row: StateRow): boolean {
  return row.m5_vs_judas_direction === 'AGAINST_JUDAS'
    && row.m5_momentum_type === 'SUSTAINED';
}

function isFilter2(row: StateRow): boolean {
  return row.auto_direction_confidence === 'high';
}

function isFilter3(row: StateRow): boolean {
  return isFilter1(row) || isFilter2(row);
}

function computeStats(rows: TextbookSlotRow[]): SlotStats {
  const valid = rows.filter((row) => row.aligned_pips !== null);
  if (valid.length === 0) {
    return {
      n: 0,
      avg_aligned_pips: 0,
      avg_opposing_pips: 0,
      pip_edge: 0,
      pct_candle_aligned: 0,
      pct_candle_opposing: 0,
    };
  }
  const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const avgAligned = avg(valid.map((row) => row.aligned_pips!));
  const avgOpposing = avg(valid.map((row) => row.opposing_pips!));
  const candleRows = valid.filter((row) => row.candle_aligned !== null);
  const pctAligned = candleRows.length > 0
    ? (candleRows.filter((row) => row.candle_aligned === true).length / candleRows.length) * 100
    : 0;
  const pctOpposing = candleRows.length > 0
    ? (candleRows.filter((row) => row.candle_aligned === false).length / candleRows.length) * 100
    : 0;
  return {
    n: valid.length,
    avg_aligned_pips: Math.round(avgAligned * 10) / 10,
    avg_opposing_pips: Math.round(avgOpposing * 10) / 10,
    pip_edge: Math.round((avgAligned - avgOpposing) * 10) / 10,
    pct_candle_aligned: Math.round(pctAligned * 10) / 10,
    pct_candle_opposing: Math.round(pctOpposing * 10) / 10,
  };
}

function slotStatsForFilter(
  rows: TextbookSlotRow[],
  slotLabel: string,
  dateFilter: (row: TextbookSlotRow) => boolean,
): SlotStats {
  const slotRows = rows.filter(
    (row) => row.slot_label === slotLabel && dateFilter(row),
  );
  return computeStats(slotRows);
}

function printFilterTable(
  title: string,
  rows: TextbookSlotRow[],
  dateFilter: (row: TextbookSlotRow) => boolean,
): void {
  console.log(`\n── ${title} ──`);
  console.log('SLOT          | N  | AlignP | OppP | Edge  | %Algn');
  for (const slot of SLOTS_1H) {
    const stats = slotStatsForFilter(rows, slot.label, dateFilter);
    const edgeStr = stats.pip_edge >= 0 ? `+${stats.pip_edge}p` : `${stats.pip_edge}p`;
    console.log(
      `${slot.label.padEnd(13)} | ${String(stats.n).padStart(2)} | ` +
      `${String(stats.avg_aligned_pips).padStart(5)}p | ${String(stats.avg_opposing_pips).padStart(5)}p | ` +
      `${edgeStr.padStart(5)} | ${String(stats.pct_candle_aligned).padStart(4)}%`,
    );
  }
}

function buildTextbookSlotRows(
  stateRow: StateRow,
  candles: M5RawCandle[],
): TextbookSlotRow[] {
  const predicted = judasPredicted(stateRow.judas_direction);
  const f1 = isFilter1(stateRow);
  const f2 = isFilter2(stateRow);
  const f3 = isFilter3(stateRow);
  const rows: TextbookSlotRow[] = [];

  for (const slot of SLOTS_1H) {
    const { startIdx, endIdx } = slotIndices(slot);
    const metrics = aggregateSlot(candles, startIdx, endIdx);
    if (!metrics) continue;
    const aligned = alignedPips(predicted, metrics);
    const opposing = opposingPips(predicted, metrics);
    const edge = aligned != null && opposing != null
      ? Math.round((aligned - opposing) * 10) / 10
      : null;
    rows.push({
      trade_date: stateRow.trade_date,
      judas_direction: stateRow.judas_direction,
      decision_auto_direction: stateRow.decision_auto_direction,
      m5_vs_judas_direction: stateRow.m5_vs_judas_direction,
      m5_momentum_type: stateRow.m5_momentum_type,
      auto_direction_confidence: stateRow.auto_direction_confidence,
      in_filter1: f1,
      in_filter2: f2,
      in_filter3: f3,
      slot_label: slot.label,
      aligned_pips: aligned,
      opposing_pips: opposing,
      pip_edge: edge,
      candle_aligned: candleAligned(predicted, metrics),
    });
  }
  return rows;
}

function writeDetailCsv(rows: TextbookSlotRow[], outputPath: string): void {
  const header = [
    'trade_date', 'judas_direction', 'decision_auto_direction',
    'm5_vs_judas_direction', 'm5_momentum_type',
    'auto_direction_confidence', 'in_filter1', 'in_filter2', 'in_filter3',
    'slot_label', 'aligned_pips', 'opposing_pips', 'pip_edge', 'candle_aligned',
  ].join(',');
  const lines = rows.map((row) => [
    row.trade_date,
    row.judas_direction ?? '',
    row.decision_auto_direction ?? '',
    row.m5_vs_judas_direction ?? '',
    row.m5_momentum_type ?? '',
    row.auto_direction_confidence ?? '',
    row.in_filter1,
    row.in_filter2,
    row.in_filter3,
    row.slot_label,
    row.aligned_pips ?? '',
    row.opposing_pips ?? '',
    row.pip_edge ?? '',
    row.candle_aligned ?? '',
  ].join(','));
  fs.writeFileSync(outputPath, [header, ...lines].join('\n') + '\n');
}

function formatSlotComparison(label: string, stats: SlotStats): string {
  const edgeStr = stats.pip_edge >= 0 ? `+${stats.pip_edge}p` : `${stats.pip_edge}p`;
  return `  ${label}:  ${stats.pct_candle_aligned}% aligned, ${edgeStr} edge`;
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
      trade_date,
      amd_outcome_tag,
      judas_direction,
      decision_auto_direction,
      m5_vs_judas_direction,
      m5_momentum_type,
      auto_direction_confidence
    `)
    .eq('pair', PAIR)
    .not('amd_outcome_tag', 'is', null);

  if (stateErr || !stateRows) {
    throw new Error(`amd_state fetch failed: ${stateErr?.message ?? 'no data'}`);
  }

  const candleByDate = new Map<string, M5RawCandle[]>();
  for (const candleRow of candleRows) {
    const tradeDate = candleRow.trade_date as string;
    const candleCount = candleRow.candle_count as number;
    const candles = candleRow.candles as M5RawCandle[];
    if (candleCount >= 60 && candles && candles.length >= 72) {
      candleByDate.set(tradeDate, candles);
    }
  }

  const textbookRows = (stateRows as StateRow[]).filter(
    (row) => row.amd_outcome_tag === 'AMD_TEXTBOOK',
  );
  const filter1Rows = textbookRows.filter(isFilter1);
  const filter2Rows = textbookRows.filter(isFilter2);
  const filter3Rows = textbookRows.filter(isFilter3);
  const filter4Rows = textbookRows.filter(
    (row) => !isFilter1(row) && !isFilter2(row),
  );

  const allSlotRows: TextbookSlotRow[] = [];
  let skipped = 0;

  for (const stateRow of textbookRows) {
    const candles = candleByDate.get(stateRow.trade_date);
    if (!candles) {
      skipped += 1;
      continue;
    }
    allSlotRows.push(...buildTextbookSlotRows(stateRow, candles));
  }

  const analyzedDays = new Set(allSlotRows.map((row) => row.trade_date)).size;
  const baselineFilter = () => true;
  const f1Filter = (row: TextbookSlotRow) => row.in_filter1;
  const f2Filter = (row: TextbookSlotRow) => row.in_filter2;
  const f3Filter = (row: TextbookSlotRow) => row.in_filter3;
  const f4Filter = (row: TextbookSlotRow) => !row.in_filter3;

  console.log('=== TEXTBOOK SLOT ENTRY BACKTEST — PROXY FILTER ANALYSIS ===');
  console.log('Testing whether 10:31 UTC proxy signals identify high-conviction TEXTBOOK days');
  console.log(`\nPopulation: ALL TEXTBOOK days = ${textbookRows.length}`);
  console.log(`Filter 1 (AGAINST_JUDAS + SUSTAINED):   n=${filter1Rows.length}`);
  console.log(`Filter 2 (HIGH confidence):              n=${filter2Rows.length}`);
  console.log(`Filter 3 (F1 OR F2):                    n=${filter3Rows.length}`);
  console.log(`Filter 4 (missed by both proxies):      n=${filter4Rows.length}`);

  printFilterTable(
    `BASELINE: ALL TEXTBOOK (n=${analyzedDays}) — 1H SLOTS`,
    allSlotRows,
    baselineFilter,
  );
  printFilterTable(
    `FILTER 1: AGAINST_JUDAS + SUSTAINED (n=${filter1Rows.length}) — 1H SLOTS`,
    allSlotRows,
    f1Filter,
  );
  printFilterTable(
    `FILTER 2: HIGH CONFIDENCE (n=${filter2Rows.length}) — 1H SLOTS`,
    allSlotRows,
    f2Filter,
  );
  printFilterTable(
    `FILTER 3: F1 OR F2 UNION (n=${filter3Rows.length}) — 1H SLOTS`,
    allSlotRows,
    f3Filter,
  );
  printFilterTable(
    `FILTER 4: MISSED BY BOTH PROXIES (n=${filter4Rows.length}) — 1H SLOTS`,
    allSlotRows,
    f4Filter,
  );

  const targetSlot = '12:00-13:00';
  const reversionSlot = '14:00-15:00';
  const baselineTarget = slotStatsForFilter(allSlotRows, targetSlot, baselineFilter);
  const f1Target = slotStatsForFilter(allSlotRows, targetSlot, f1Filter);
  const f2Target = slotStatsForFilter(allSlotRows, targetSlot, f2Filter);
  const f3Target = slotStatsForFilter(allSlotRows, targetSlot, f3Filter);
  const f4Target = slotStatsForFilter(allSlotRows, targetSlot, f4Filter);

  const f3Reversion = slotStatsForFilter(allSlotRows, reversionSlot, f3Filter);
  const baselineReversion = slotStatsForFilter(allSlotRows, reversionSlot, baselineFilter);

  const bestFilterEdge = Math.max(f1Target.pip_edge, f2Target.pip_edge, f3Target.pip_edge);
  const improvesBaseline = bestFilterEdge > baselineTarget.pip_edge
    || (f3Target.pct_candle_aligned > baselineTarget.pct_candle_aligned);
  const edgeDelta = Math.round((f3Target.pip_edge - baselineTarget.pip_edge) * 10) / 10;
  const alignDelta = Math.round((f3Target.pct_candle_aligned - baselineTarget.pct_candle_aligned) * 10) / 10;

  const f3Coverage = textbookRows.length > 0
    ? Math.round((filter3Rows.length / textbookRows.length) * 1000) / 10
    : 0;
  const noProxyPct = textbookRows.length > 0
    ? Math.round((filter4Rows.length / textbookRows.length) * 1000) / 10
    : 0;

  console.log('\n── KEY FINDINGS ──');
  console.log(`Filter 1 n: ${filter1Rows.length} (of ${textbookRows.length} TEXTBOOK days)`);
  console.log(`Filter 2 n: ${filter2Rows.length}`);
  console.log(`Filter 3 coverage: ${f3Coverage}% of TEXTBOOK days caught by at least one proxy`);
  console.log('\n12:00-13:00 slot comparison:');
  console.log(formatSlotComparison('Baseline', baselineTarget));
  console.log(formatSlotComparison('Filter 1', f1Target));
  console.log(formatSlotComparison('Filter 2', f2Target));
  console.log(formatSlotComparison('Filter 3', f3Target));
  console.log(formatSlotComparison('Filter 4 (missed)', f4Target));
  console.log(
    `\nDoes proxy filter improve on baseline? ${improvesBaseline ? 'YES' : 'NO'} ` +
    `(F3 delta: ${alignDelta >= 0 ? '+' : ''}${alignDelta}% aligned, ` +
    `${edgeDelta >= 0 ? '+' : ''}${edgeDelta}p edge vs baseline)`,
  );
  console.log(
    `Does the 14:00-15:00 reversion hold in filtered days? ` +
    `${f3Reversion.pip_edge < 0 ? 'YES' : 'NO'} ` +
    `(F3: ${f3Reversion.pip_edge}p edge vs baseline ${baselineReversion.pip_edge}p)`,
  );
  console.log(`What % of TEXTBOOK days have NO proxy signal available at 10:31? ${noProxyPct}%`);

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputPath = path.join(
    process.cwd(),
    'scripts/output',
    `amd_textbook_slot_entry_${stamp}.csv`,
  );
  writeDetailCsv(allSlotRows, outputPath);
  console.log(`\nDetail CSV: ${outputPath}`);
  console.log(`TEXTBOOK days with candles: ${analyzedDays} | Skipped (no candles): ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
