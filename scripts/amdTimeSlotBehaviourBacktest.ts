/**
 * AMD time slot behaviour backtest — 30m and 1H pivot analysis across distribution window.
 * READ-ONLY research — reads amd_m5_distribution_candles + amd_state outcomes.
 *
 * Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/amdTimeSlotBehaviourBacktest.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const PAIR = 'AUD_USD';

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

type DetailRow = {
  trade_date: string;
  amd_outcome_tag: string;
  judas_direction: string | null;
  slot_type: '30m' | '1H';
  slot_label: string;
  up_pips: number;
  down_pips: number;
  net_pips: number;
  total_range: number;
  dominant_direction: string;
  candle_direction: string;
};

type GroupStats = {
  n: number;
  avg_up_pips: number;
  avg_down_pips: number;
  avg_net_pips: number;
  avg_total_range: number;
  pct_up_dominant: number;
  pct_down_dominant: number;
  pct_candle_up: number;
  pct_candle_down: number;
  max_up_pips: number;
  max_down_pips: number;
  median_total_range: number;
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

const GROUP_DEFS: Array<{ key: string; title: string; match: (tag: string) => boolean }> = [
  { key: 'ALL', title: 'ALL', match: () => true },
  {
    key: 'AMD',
    title: 'AMD DAYS',
    match: (tag) =>
      tag === 'AMD_TEXTBOOK' ||
      tag === 'AMD_COMPRESSION_BREAKOUT' ||
      tag === 'AMD_FAILED',
  },
  {
    key: 'NON_AMD',
    title: 'NON-AMD DAYS',
    match: (tag) => tag === 'AMD_SHIFTED' || tag === 'AMD_NONE',
  },
  { key: 'AMD_TEXTBOOK', title: 'TEXTBOOK', match: (tag) => tag === 'AMD_TEXTBOOK' },
  {
    key: 'AMD_COMPRESSION_BREAKOUT',
    title: 'COMPRESSION',
    match: (tag) => tag === 'AMD_COMPRESSION_BREAKOUT',
  },
  { key: 'AMD_FAILED', title: 'FAILED', match: (tag) => tag === 'AMD_FAILED' },
  { key: 'AMD_SHIFTED', title: 'SHIFTED', match: (tag) => tag === 'AMD_SHIFTED' },
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
  }
  return sorted[mid];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function computeGroupStats(rows: DetailRow[]): GroupStats {
  if (rows.length === 0) {
    return {
      n: 0,
      avg_up_pips: 0,
      avg_down_pips: 0,
      avg_net_pips: 0,
      avg_total_range: 0,
      pct_up_dominant: 0,
      pct_down_dominant: 0,
      pct_candle_up: 0,
      pct_candle_down: 0,
      max_up_pips: 0,
      max_down_pips: 0,
      median_total_range: 0,
    };
  }

  const totalRanges = rows.map((row) => row.total_range);
  const upDominant = rows.filter((row) => row.up_pips > row.down_pips).length;
  const candleUp = rows.filter((row) => row.candle_direction === 'UP').length;
  const candleDown = rows.filter((row) => row.candle_direction === 'DOWN').length;
  const n = rows.length;

  return {
    n,
    avg_up_pips: round1(rows.reduce((s, r) => s + r.up_pips, 0) / n),
    avg_down_pips: round1(rows.reduce((s, r) => s + r.down_pips, 0) / n),
    avg_net_pips: round1(rows.reduce((s, r) => s + r.net_pips, 0) / n),
    avg_total_range: round1(totalRanges.reduce((s, v) => s + v, 0) / n),
    pct_up_dominant: round1((upDominant / n) * 100),
    pct_down_dominant: round1((rows.filter((row) => row.down_pips > row.up_pips).length / n) * 100),
    pct_candle_up: round1((candleUp / n) * 100),
    pct_candle_down: round1((candleDown / n) * 100),
    max_up_pips: Math.max(...rows.map((r) => r.up_pips)),
    max_down_pips: Math.max(...rows.map((r) => r.down_pips)),
    median_total_range: median(totalRanges),
  };
}

function printSlotTable(
  title: string,
  slotType: '30m' | '1H',
  slots: SlotDef[],
  detailRows: DetailRow[],
  rowMatch: (row: DetailRow) => boolean,
): void {
  console.log(`\n── ${title} ──`);
  console.log(
    'SLOT          | N  | AvgUp | AvgDn | AvgNet | AvgRange | %UpDom | %DnDom | %CndlUp | %CndlDn',
  );
  for (const slot of slots) {
    const slotRows = detailRows.filter(
      (row) =>
        row.slot_type === slotType &&
        row.slot_label === slot.label &&
        rowMatch(row),
    );
    const stats = computeGroupStats(slotRows);
    console.log(
      `${slot.label.padEnd(13)} | ${String(stats.n).padStart(2)} | ` +
      `${String(stats.avg_up_pips).padStart(5)}p | ${String(stats.avg_down_pips).padStart(5)}p | ` +
      `${String(stats.avg_net_pips).padStart(5)}p | ${String(stats.avg_total_range).padStart(6)}p | ` +
      `${String(stats.pct_up_dominant).padStart(5)}% | ${String(stats.pct_down_dominant).padStart(5)}% | ` +
      `${String(stats.pct_candle_up).padStart(6)}% | ${String(stats.pct_candle_down).padStart(6)}%`,
    );
  }
}

function printKeyFindings(detailRows: DetailRow[]): void {
  console.log('\n── KEY FINDINGS ──');

  let best30: { label: string; range: number } | null = null;
  let best1H: { label: string; range: number } | null = null;

  for (const slot of SLOTS_30M) {
    const rows = detailRows.filter((r) => r.slot_type === '30m' && r.slot_label === slot.label);
    const stats = computeGroupStats(rows);
    if (!best30 || stats.avg_total_range > best30.range) {
      best30 = { label: slot.label, range: stats.avg_total_range };
    }
  }
  for (const slot of SLOTS_1H) {
    const rows = detailRows.filter((r) => r.slot_type === '1H' && r.slot_label === slot.label);
    const stats = computeGroupStats(rows);
    if (!best1H || stats.avg_total_range > best1H.range) {
      best1H = { label: slot.label, range: stats.avg_total_range };
    }
  }

  let mostConsistent: { label: string; type: string; pct: number; dir: string } | null = null;
  for (const slotType of ['30m', '1H'] as const) {
    const slots = slotType === '30m' ? SLOTS_30M : SLOTS_1H;
    for (const slot of slots) {
      const rows = detailRows.filter(
        (r) => r.slot_type === slotType && r.slot_label === slot.label,
      );
      const stats = computeGroupStats(rows);
      const dominantPct = Math.max(stats.pct_up_dominant, stats.pct_down_dominant);
      const dir = stats.pct_up_dominant >= stats.pct_down_dominant ? 'UP' : 'DOWN';
      if (!mostConsistent || dominantPct > mostConsistent.pct) {
        mostConsistent = { label: slot.label, type: slotType, pct: dominantPct, dir };
      }
    }
  }

  let meanRevert: { label: string; type: string; range: number; skew: number } | null = null;
  for (const slotType of ['30m', '1H'] as const) {
    const slots = slotType === '30m' ? SLOTS_30M : SLOTS_1H;
    for (const slot of slots) {
      const rows = detailRows.filter(
        (r) => r.slot_type === slotType && r.slot_label === slot.label,
      );
      const stats = computeGroupStats(rows);
      const skew = Math.abs(stats.pct_up_dominant - stats.pct_down_dominant);
      if (
        !meanRevert ||
        (skew < meanRevert.skew && stats.avg_total_range >= meanRevert.range * 0.8) ||
        (skew === meanRevert.skew && stats.avg_total_range > meanRevert.range)
      ) {
        meanRevert = {
          label: slot.label,
          type: slotType,
          range: stats.avg_total_range,
          skew,
        };
      }
    }
  }

  console.log(
    `Highest avg range slot (30m): ${best30?.label ?? '—'} at ${best30?.range ?? 0}p avg`,
  );
  console.log(
    `Highest avg range slot (1H):  ${best1H?.label ?? '—'} at ${best1H?.range ?? 0}p avg`,
  );
  if (mostConsistent) {
    console.log(
      `Most directionally consistent slot: ${mostConsistent.label} (${mostConsistent.type}) ` +
      `${mostConsistent.pct}% ${mostConsistent.dir} dominant`,
    );
  }
  if (meanRevert) {
    console.log(
      `Most mean-reverting slot: ${meanRevert.label} (${meanRevert.type}) ` +
      `(up_pips ≈ down_pips, avg range ${meanRevert.range}p)`,
    );
  }
}

function writeDetailCsv(detailRows: DetailRow[], outputPath: string): void {
  const header = [
    'trade_date', 'amd_outcome_tag', 'slot_type', 'slot_label',
    'up_pips', 'down_pips', 'net_pips', 'total_range',
    'dominant_direction', 'candle_direction',
  ].join(',');
  const lines = detailRows.map((row) =>
    [
      row.trade_date, row.amd_outcome_tag, row.slot_type, row.slot_label,
      row.up_pips, row.down_pips, row.net_pips, row.total_range,
      row.dominant_direction, row.candle_direction,
    ].join(','),
  );
  fs.writeFileSync(outputPath, [header, ...lines].join('\n') + '\n');
}

function buildDetailRows(
  tradeDate: string,
  outcomeTag: string,
  judasDirection: string | null,
  candles: M5RawCandle[],
): DetailRow[] {
  const rows: DetailRow[] = [];
  for (const slot of SLOTS_30M) {
    const { startIdx, endIdx } = slotIndices(slot);
    const metrics = aggregateSlot(candles, startIdx, endIdx);
    if (!metrics) continue;
    rows.push({
      trade_date: tradeDate,
      amd_outcome_tag: outcomeTag,
      judas_direction: judasDirection,
      slot_type: '30m',
      slot_label: slot.label,
      up_pips: metrics.up_pips,
      down_pips: metrics.down_pips,
      net_pips: metrics.net_pips,
      total_range: metrics.up_pips + metrics.down_pips,
      dominant_direction: metrics.dominant_direction,
      candle_direction: metrics.candle_direction,
    });
  }
  for (const slot of SLOTS_1H) {
    const { startIdx, endIdx } = slotIndices(slot);
    const metrics = aggregateSlot(candles, startIdx, endIdx);
    if (!metrics) continue;
    rows.push({
      trade_date: tradeDate,
      amd_outcome_tag: outcomeTag,
      judas_direction: judasDirection,
      slot_type: '1H',
      slot_label: slot.label,
      up_pips: metrics.up_pips,
      down_pips: metrics.down_pips,
      net_pips: metrics.net_pips,
      total_range: metrics.up_pips + metrics.down_pips,
      dominant_direction: metrics.dominant_direction,
      candle_direction: metrics.candle_direction,
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

  const { data: m5Rows, error: m5Err } = await supabase
    .from('amd_m5_distribution_candles')
    .select('trade_date, candles, candle_count')
    .eq('pair', PAIR)
    .eq('fetch_status', 'success')
    .order('trade_date', { ascending: true });

  if (m5Err || !m5Rows) {
    throw new Error(`M5 fetch failed: ${m5Err?.message ?? 'no data'}`);
  }

  const { data: stateRows, error: stateErr } = await supabase
    .from('amd_state')
    .select('trade_date, amd_outcome_tag, judas_direction')
    .eq('pair', PAIR)
    .not('amd_outcome_tag', 'is', null);

  if (stateErr || !stateRows) {
    throw new Error(`amd_state fetch failed: ${stateErr?.message ?? 'no data'}`);
  }

  const stateByDate = new Map(
    stateRows.map((row) => [
      row.trade_date as string,
      {
        outcomeTag: row.amd_outcome_tag as string,
        judasDirection: (row.judas_direction as string | null) ?? null,
      },
    ]),
  );

  const detailRows: DetailRow[] = [];
  let skipped = 0;

  for (const m5Row of m5Rows) {
    const tradeDate = m5Row.trade_date as string;
    const candleCount = m5Row.candle_count as number;
    const candles = m5Row.candles as M5RawCandle[];
    const stateRow = stateByDate.get(tradeDate);

    if (!stateRow || candleCount < 60 || !candles || candles.length < 72) {
      skipped += 1;
      continue;
    }

    detailRows.push(
      ...buildDetailRows(
        tradeDate,
        stateRow.outcomeTag,
        stateRow.judasDirection,
        candles,
      ),
    );
  }

  const dayCount = new Set(detailRows.map((row) => row.trade_date)).size;
  const amdDayCount = new Set(
    detailRows.filter((row) =>
      row.amd_outcome_tag === 'AMD_TEXTBOOK' ||
      row.amd_outcome_tag === 'AMD_COMPRESSION_BREAKOUT' ||
      row.amd_outcome_tag === 'AMD_FAILED',
    ).map((row) => row.trade_date),
  ).size;
  const nonAmdDayCount = new Set(
    detailRows.filter((row) =>
      row.amd_outcome_tag === 'AMD_SHIFTED' || row.amd_outcome_tag === 'AMD_NONE',
    ).map((row) => row.trade_date),
  ).size;

  console.log('=== AMD TIME SLOT BEHAVIOUR BACKTEST ===');
  console.log(
    `${dayCount} days analyzed | Distribution window 10:00-16:00 UTC | AUDUSD M5 | Skipped: ${skipped}`,
  );

  printSlotTable(
    `30-MINUTE SLOTS — ALL ${dayCount} DAYS`,
    '30m',
    SLOTS_30M,
    detailRows,
    () => true,
  );
  printSlotTable(
    `30-MINUTE SLOTS — AMD DAYS (${amdDayCount})`,
    '30m',
    SLOTS_30M,
    detailRows,
    (row) =>
      row.amd_outcome_tag === 'AMD_TEXTBOOK' ||
      row.amd_outcome_tag === 'AMD_COMPRESSION_BREAKOUT' ||
      row.amd_outcome_tag === 'AMD_FAILED',
  );
  printSlotTable(
    `30-MINUTE SLOTS — NON-AMD DAYS (${nonAmdDayCount})`,
    '30m',
    SLOTS_30M,
    detailRows,
    (row) => row.amd_outcome_tag === 'AMD_SHIFTED' || row.amd_outcome_tag === 'AMD_NONE',
  );

  printSlotTable(
    `1-HOUR SLOTS — ALL ${dayCount} DAYS`,
    '1H',
    SLOTS_1H,
    detailRows,
    () => true,
  );

  for (const group of GROUP_DEFS.slice(3)) {
    const groupDays = new Set(
      detailRows.filter((row) => group.match(row.amd_outcome_tag)).map((row) => row.trade_date),
    ).size;
    printSlotTable(
      `1-HOUR SLOTS — ${group.title} (${groupDays})`,
      '1H',
      SLOTS_1H,
      detailRows,
      (row) => group.match(row.amd_outcome_tag),
    );

    if (group.key === 'AMD_TEXTBOOK') {
      const textbookUpDays = new Set(
        detailRows.filter(
          (row) => row.amd_outcome_tag === 'AMD_TEXTBOOK' && row.judas_direction === 'UP',
        ).map((row) => row.trade_date),
      ).size;
      const textbookDownDays = new Set(
        detailRows.filter(
          (row) => row.amd_outcome_tag === 'AMD_TEXTBOOK' && row.judas_direction === 'DOWN',
        ).map((row) => row.trade_date),
      ).size;

      printSlotTable(
        `1-HOUR SLOTS — TEXTBOOK + UP JUDAS (predict SHORT) (${textbookUpDays})`,
        '1H',
        SLOTS_1H,
        detailRows,
        (row) => row.amd_outcome_tag === 'AMD_TEXTBOOK' && row.judas_direction === 'UP',
      );
      printSlotTable(
        `1-HOUR SLOTS — TEXTBOOK + DOWN JUDAS (predict LONG) (${textbookDownDays})`,
        '1H',
        SLOTS_1H,
        detailRows,
        (row) => row.amd_outcome_tag === 'AMD_TEXTBOOK' && row.judas_direction === 'DOWN',
      );
    }
  }

  printKeyFindings(detailRows);

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outputPath = path.join(
    process.cwd(),
    'scripts/output',
    `amd_timeslot_behaviour_${stamp}.csv`,
  );
  writeDetailCsv(detailRows, outputPath);
  console.log(`\nDetail CSV: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
