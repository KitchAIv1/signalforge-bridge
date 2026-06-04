/**
 * AMD direction-aligned slot backtest — Judas inversion vs decision_auto_direction.
 * READ-ONLY research — reads amd_m5_distribution_candles + amd_state.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amdDirectionAlignedSlotBacktest.ts
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

type DaySlotRow = {
  trade_date: string;
  outcomeTag: string;
  judas_direction: string | null;
  decision_auto_direction: string | null;
  judas_predicted: PredictedDir | null;
  system_predicted: PredictedDir | null;
  sources_agree: boolean | null;
  slot_type: '30m' | '1H';
  slot_label: string;
  judas_aligned_pips: number | null;
  judas_opposing_pips: number | null;
  judas_candle_aligned: boolean | null;
  system_aligned_pips: number | null;
  system_opposing_pips: number | null;
  system_candle_aligned: boolean | null;
};

type SlotStats = {
  n: number;
  avg_aligned_pips: number;
  avg_opposing_pips: number;
  pip_edge: number;
  pct_candle_aligned: number;
  pct_candle_opposing: number;
};

const SLOTS_30M: SlotDef[] = [
  { label: '10:30-11:00', startMinute: 30, endMinute: 60 },
  { label: '11:00-11:30', startMinute: 60, endMinute: 90 },
  { label: '11:30-12:00', startMinute: 90, endMinute: 120 },
  { label: '12:00-12:30', startMinute: 120, endMinute: 150 },
  { label: '12:30-13:00', startMinute: 150, endMinute: 180 },
  { label: '13:00-13:30', startMinute: 180, endMinute: 210 },
  { label: '13:30-14:00', startMinute: 210, endMinute: 240 },
  { label: '14:00-14:30', startMinute: 240, endMinute: 270 },
  { label: '14:30-15:00', startMinute: 270, endMinute: 300 },
  { label: '15:00-15:30', startMinute: 300, endMinute: 330 },
  { label: '15:30-16:00', startMinute: 330, endMinute: 360 },
];

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

function systemPredicted(decisionAutoDirection: string | null): PredictedDir | null {
  if (decisionAutoDirection === 'long') return 'LONG';
  if (decisionAutoDirection === 'short') return 'SHORT';
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

function computeStats(rows: DaySlotRow[], source: 'judas' | 'system'): SlotStats {
  const valid = rows.filter((row) =>
    source === 'judas' ? row.judas_aligned_pips !== null : row.system_aligned_pips !== null,
  );
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
  const alignedValues = valid.map((row) =>
    source === 'judas' ? row.judas_aligned_pips! : row.system_aligned_pips!,
  );
  const opposingValues = valid.map((row) =>
    source === 'judas' ? row.judas_opposing_pips! : row.system_opposing_pips!,
  );
  const avgAligned = avg(alignedValues);
  const avgOpposing = avg(opposingValues);
  const candleRows = valid.filter((row) =>
    source === 'judas' ? row.judas_candle_aligned !== null : row.system_candle_aligned !== null,
  );
  const pctAligned = candleRows.length > 0
    ? (candleRows.filter((row) =>
      source === 'judas' ? row.judas_candle_aligned === true : row.system_candle_aligned === true,
    ).length / candleRows.length) * 100
    : 0;
  const pctOpposing = candleRows.length > 0
    ? (candleRows.filter((row) =>
      source === 'judas' ? row.judas_candle_aligned === false : row.system_candle_aligned === false,
    ).length / candleRows.length) * 100
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

function isAmd(tag: string): boolean {
  return ['AMD_TEXTBOOK', 'AMD_COMPRESSION_BREAKOUT', 'AMD_FAILED'].includes(tag);
}

function isNonAmd(tag: string): boolean {
  return ['AMD_SHIFTED', 'AMD_NONE'].includes(tag);
}

function buildSlotRow(
  tradeDate: string,
  outcomeTag: string,
  judasDirection: string | null,
  decisionAutoDirection: string | null,
  slotType: '30m' | '1H',
  slotLabel: string,
  slot: SlotMetrics,
): DaySlotRow {
  const judasPred = judasPredicted(judasDirection);
  const systemPred = systemPredicted(decisionAutoDirection);
  const agree =
    judasPred !== null && systemPred !== null ? judasPred === systemPred : null;
  return {
    trade_date: tradeDate,
    outcomeTag,
    judas_direction: judasDirection,
    decision_auto_direction: decisionAutoDirection,
    judas_predicted: judasPred,
    system_predicted: systemPred,
    sources_agree: agree,
    slot_type: slotType,
    slot_label: slotLabel,
    judas_aligned_pips: alignedPips(judasPred, slot),
    judas_opposing_pips: opposingPips(judasPred, slot),
    judas_candle_aligned: candleAligned(judasPred, slot),
    system_aligned_pips: alignedPips(systemPred, slot),
    system_opposing_pips: opposingPips(systemPred, slot),
    system_candle_aligned: candleAligned(systemPred, slot),
  };
}

function buildDaySlotRows(
  tradeDate: string,
  outcomeTag: string,
  judasDirection: string | null,
  decisionAutoDirection: string | null,
  candles: M5RawCandle[],
): DaySlotRow[] {
  const rows: DaySlotRow[] = [];
  for (const slot of SLOTS_30M) {
    const { startIdx, endIdx } = slotIndices(slot);
    const metrics = aggregateSlot(candles, startIdx, endIdx);
    if (!metrics) continue;
    rows.push(
      buildSlotRow(
        tradeDate, outcomeTag, judasDirection, decisionAutoDirection,
        '30m', slot.label, metrics,
      ),
    );
  }
  for (const slot of SLOTS_1H) {
    const { startIdx, endIdx } = slotIndices(slot);
    const metrics = aggregateSlot(candles, startIdx, endIdx);
    if (!metrics) continue;
    rows.push(
      buildSlotRow(
        tradeDate, outcomeTag, judasDirection, decisionAutoDirection,
        '1H', slot.label, metrics,
      ),
    );
  }
  return rows;
}

function printAlignedTable(
  title: string,
  slotType: '30m' | '1H',
  slots: SlotDef[],
  rows: DaySlotRow[],
  rowFilter: (row: DaySlotRow) => boolean,
  source: 'judas' | 'system',
): void {
  console.log(`\n── ${title} ──`);
  console.log('SLOT          | N   | AlignP | OppP | Edge  | %Algn | %Opp');
  for (const slot of slots) {
    const slotRows = rows.filter(
      (row) => row.slot_type === slotType && row.slot_label === slot.label && rowFilter(row),
    );
    const stats = computeStats(slotRows, source);
    console.log(
      `${slot.label.padEnd(13)} | ${String(stats.n).padStart(3)} | ` +
      `${String(stats.avg_aligned_pips).padStart(5)}p | ${String(stats.avg_opposing_pips).padStart(5)}p | ` +
      `${String(stats.pip_edge).padStart(5)}p | ${String(stats.pct_candle_aligned).padStart(4)}% | ` +
      `${String(stats.pct_candle_opposing).padStart(4)}%`,
    );
  }
}

function bestSlotByEdge(
  rows: DaySlotRow[],
  slotType: '30m' | '1H',
  slots: SlotDef[],
  rowFilter: (row: DaySlotRow) => boolean,
  source: 'judas' | 'system',
): { label: string; edge: number; pctAligned: number } | null {
  let best: { label: string; edge: number; pctAligned: number } | null = null;
  for (const slot of slots) {
    const slotRows = rows.filter(
      (row) => row.slot_type === slotType && row.slot_label === slot.label && rowFilter(row),
    );
    const stats = computeStats(slotRows, source);
    if (stats.n === 0) continue;
    if (!best || stats.pip_edge > best.edge) {
      best = { label: slot.label, edge: stats.pip_edge, pctAligned: stats.pct_candle_aligned };
    }
  }
  return best;
}

function meanPipEdge(
  rows: DaySlotRow[],
  slotType: '30m' | '1H',
  slots: SlotDef[],
  rowFilter: (row: DaySlotRow) => boolean,
  source: 'judas' | 'system',
): number {
  const edges = slots.map((slot) => {
    const slotRows = rows.filter(
      (row) => row.slot_type === slotType && row.slot_label === slot.label && rowFilter(row),
    );
    return computeStats(slotRows, source).pip_edge;
  });
  return Math.round((edges.reduce((a, b) => a + b, 0) / edges.length) * 10) / 10;
}

function writeDetailCsv(rows: DaySlotRow[], outputPath: string): void {
  const header = [
    'trade_date', 'amd_outcome_tag', 'judas_direction', 'judas_predicted',
    'decision_auto_direction', 'system_predicted', 'sources_agree',
    'slot_type', 'slot_label',
    'aligned_pips', 'opposing_pips', 'pip_edge', 'candle_aligned',
  ].join(',');
  const lines = rows.map((row) => {
    const aligned = row.judas_aligned_pips;
    const opposing = row.judas_opposing_pips;
    const edge = aligned != null && opposing != null
      ? Math.round((aligned - opposing) * 10) / 10
      : '';
    return [
      row.trade_date, row.outcomeTag, row.judas_direction ?? '', row.judas_predicted ?? '',
      row.decision_auto_direction ?? '', row.system_predicted ?? '', row.sources_agree ?? '',
      row.slot_type, row.slot_label,
      aligned ?? '', opposing ?? '', edge,
      row.judas_candle_aligned ?? '',
    ].join(',');
  });
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
    .select('trade_date, amd_outcome_tag, judas_direction, decision_auto_direction')
    .eq('pair', PAIR)
    .not('amd_outcome_tag', 'is', null);

  if (stateErr || !stateRows) {
    throw new Error(`amd_state fetch failed: ${stateErr?.message ?? 'no data'}`);
  }

  const stateByDate = new Map<string, {
    outcomeTag: string;
    judasDirection: string | null;
    decisionAutoDirection: string | null;
  }>();
  for (const row of stateRows) {
    stateByDate.set(row.trade_date as string, {
      outcomeTag: row.amd_outcome_tag as string,
      judasDirection: (row.judas_direction as string | null) ?? null,
      decisionAutoDirection: (row.decision_auto_direction as string | null) ?? null,
    });
  }

  const allRows: DaySlotRow[] = [];
  let skipped = 0;

  for (const candleRow of candleRows) {
    const tradeDate = candleRow.trade_date as string;
    const stateRow = stateByDate.get(tradeDate);
    const candles = candleRow.candles as M5RawCandle[];
    const candleCount = candleRow.candle_count as number;

    if (!stateRow || candleCount < 60 || !candles || candles.length < 72) {
      skipped += 1;
      continue;
    }

    allRows.push(
      ...buildDaySlotRows(
        tradeDate,
        stateRow.outcomeTag,
        stateRow.judasDirection,
        stateRow.decisionAutoDirection,
        candles,
      ),
    );
  }

  const dayCount = new Set(allRows.map((row) => row.trade_date)).size;
  const uniqueDays = [...new Set(allRows.map((row) => row.trade_date))];
  const judasDayCount = uniqueDays.filter((date) => {
    const sample = allRows.find((row) => row.trade_date === date);
    return sample?.judas_predicted != null;
  }).length;
  const systemDayCount = uniqueDays.filter((date) => {
    const sample = allRows.find((row) => row.trade_date === date);
    return sample?.system_predicted != null;
  }).length;
  const bothDayCount = uniqueDays.filter((date) => {
    const sample = allRows.find((row) => row.trade_date === date);
    return sample?.judas_predicted != null && sample?.system_predicted != null;
  }).length;
  const agreeDayCount = uniqueDays.filter((date) => {
    const sample = allRows.find((row) => row.trade_date === date);
    return sample?.sources_agree === true;
  }).length;

  const groups = {
    A_ALL: (row: DaySlotRow) => row.judas_predicted !== null,
    A_AMD: (row: DaySlotRow) => row.judas_predicted !== null && isAmd(row.outcomeTag),
    A_NONAMD: (row: DaySlotRow) => row.judas_predicted !== null && isNonAmd(row.outcomeTag),
    A_TEXTBOOK: (row: DaySlotRow) => row.judas_predicted !== null && row.outcomeTag === 'AMD_TEXTBOOK',
    A_COMPRESSION: (row: DaySlotRow) =>
      row.judas_predicted !== null && row.outcomeTag === 'AMD_COMPRESSION_BREAKOUT',
    A_FAILED: (row: DaySlotRow) => row.judas_predicted !== null && row.outcomeTag === 'AMD_FAILED',
    A_SHIFTED: (row: DaySlotRow) => row.judas_predicted !== null && row.outcomeTag === 'AMD_SHIFTED',
    B_ALL: (row: DaySlotRow) => row.system_predicted !== null,
    B_AMD: (row: DaySlotRow) => row.system_predicted !== null && isAmd(row.outcomeTag),
    B_NONAMD: (row: DaySlotRow) => row.system_predicted !== null && isNonAmd(row.outcomeTag),
    AGREE: (row: DaySlotRow) => row.sources_agree === true,
    DISAGREE: (row: DaySlotRow) => row.sources_agree === false,
    AGREE_AMD: (row: DaySlotRow) => row.sources_agree === true && isAmd(row.outcomeTag),
    AGREE_NONAMD: (row: DaySlotRow) => row.sources_agree === true && isNonAmd(row.outcomeTag),
    DISAGREE_AMD: (row: DaySlotRow) => row.sources_agree === false && isAmd(row.outcomeTag),
  };

  console.log('=== AMD DIRECTION-ALIGNED SLOT BACKTEST ===');
  console.log('Source A = Judas inversion (market structure)');
  console.log('Source B = decision_auto_direction (system verdict, excludes neutral)');

  printAlignedTable(
    'SOURCE A: JUDAS INVERSION — ALL DAYS (30m)',
    '30m', SLOTS_30M, allRows, groups.A_ALL, 'judas',
  );
  printAlignedTable(
    'SOURCE A: JUDAS INVERSION — ALL DAYS (1H)',
    '1H', SLOTS_1H, allRows, groups.A_ALL, 'judas',
  );
  printAlignedTable(
    'SOURCE B: SYSTEM VERDICT — NON-NEUTRAL DAYS (30m)',
    '30m', SLOTS_30M, allRows, groups.B_ALL, 'system',
  );
  printAlignedTable(
    'SOURCE B: SYSTEM VERDICT — NON-NEUTRAL DAYS (1H)',
    '1H', SLOTS_1H, allRows, groups.B_ALL, 'system',
  );
  printAlignedTable(
    'AGREEMENT: A AND B SAME DIRECTION (30m)',
    '30m', SLOTS_30M, allRows, groups.AGREE, 'judas',
  );
  printAlignedTable(
    'AGREEMENT: A AND B SAME DIRECTION (1H)',
    '1H', SLOTS_1H, allRows, groups.AGREE, 'judas',
  );
  printAlignedTable(
    'DISAGREEMENT: A AND B CONFLICT (30m)',
    '30m', SLOTS_30M, allRows, groups.DISAGREE, 'judas',
  );
  printAlignedTable(
    'DISAGREEMENT: A AND B CONFLICT (1H)',
    '1H', SLOTS_1H, allRows, groups.DISAGREE, 'judas',
  );

  console.log('\n── SOURCE A BY TAG (1H only) ──');
  for (const [title, filter] of [
    ['TEXTBOOK', groups.A_TEXTBOOK],
    ['COMPRESSION', groups.A_COMPRESSION],
    ['FAILED', groups.A_FAILED],
    ['SHIFTED', groups.A_SHIFTED],
  ] as const) {
    const tagDays = new Set(
      allRows.filter(filter).map((row) => row.trade_date),
    ).size;
    printAlignedTable(
      `${title} (n=${tagDays})`,
      '1H', SLOTS_1H, allRows, filter, 'judas',
    );
  }

  const bestA30 = bestSlotByEdge(allRows, '30m', SLOTS_30M, groups.A_ALL, 'judas');
  const bestB30 = bestSlotByEdge(allRows, '30m', SLOTS_30M, groups.B_ALL, 'system');
  const bestAgree30 = bestSlotByEdge(allRows, '30m', SLOTS_30M, groups.AGREE, 'judas');
  const bestA1H = bestSlotByEdge(allRows, '1H', SLOTS_1H, groups.A_ALL, 'judas');
  const bestB1H = bestSlotByEdge(allRows, '1H', SLOTS_1H, groups.B_ALL, 'system');
  const bestAgree1H = bestSlotByEdge(allRows, '1H', SLOTS_1H, groups.AGREE, 'judas');

  const agreeEdge30 = meanPipEdge(allRows, '30m', SLOTS_30M, groups.AGREE, 'judas');
  const disagreeEdge30 = meanPipEdge(allRows, '30m', SLOTS_30M, groups.DISAGREE, 'judas');

  console.log('\n── KEY FINDINGS ──');
  console.log(
    `Source A agreement rate overall: ${Math.round((judasDayCount / dayCount) * 1000) / 10}% of days Judas predicted = non-null (${judasDayCount}/${dayCount})`,
  );
  console.log(`Source B coverage: ${systemDayCount} days non-neutral (of ${dayCount})`);
  console.log(
    `A vs B agreement: ${bothDayCount > 0 ? Math.round((agreeDayCount / bothDayCount) * 1000) / 10 : 0}% of days where both non-null agreed on direction (${agreeDayCount}/${bothDayCount})`,
  );
  console.log(`\nBest 30m slot by pip edge — Source A: ${bestA30?.label ?? '—'} at +${bestA30?.edge ?? 0}p`);
  console.log(`Best 30m slot by pip edge — Source B: ${bestB30?.label ?? '—'} at +${bestB30?.edge ?? 0}p`);
  console.log(`Best 30m slot by pip edge — AGREE:    ${bestAgree30?.label ?? '—'} at +${bestAgree30?.edge ?? 0}p`);
  console.log(`\nBest 1H slot by pip edge — Source A: ${bestA1H?.label ?? '—'} at +${bestA1H?.edge ?? 0}p`);
  console.log(`Best 1H slot by pip edge — Source B: ${bestB1H?.label ?? '—'} at +${bestB1H?.edge ?? 0}p`);
  console.log(`Best 1H slot by pip edge — AGREE:    ${bestAgree1H?.label ?? '—'} at +${bestAgree1H?.edge ?? 0}p`);
  console.log(`\n%CndlAligned at best slot — Source A: ${bestA30?.pctAligned ?? 0}%`);
  console.log(`%CndlAligned at best slot — Source B: ${bestB30?.pctAligned ?? 0}%`);
  console.log(`%CndlAligned at best slot — AGREE:    ${bestAgree30?.pctAligned ?? 0}%`);
  console.log(`\nWhen A+B AGREE vs DISAGREE — pip edge delta (30m mean): +${Math.round((agreeEdge30 - disagreeEdge30) * 10) / 10}p`);

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputPath = path.join(
    process.cwd(),
    'scripts/output',
    `amd_direction_aligned_slots_${stamp}.csv`,
  );
  writeDetailCsv(allRows, outputPath);
  console.log(`\nDetail CSV: ${outputPath}`);
  console.log(`Days analyzed: ${dayCount} | Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
