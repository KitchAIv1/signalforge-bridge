import type { SupabaseClient } from '@supabase/supabase-js';
import { OMEGA_LANE_B_BROKER_ID } from './omegaLaneBConstants.js';

export interface TimelineEntry {
  atMs: number;
  direction: 'long' | 'short';
  kind: 'fill' | 'block';
  pnlPips: number | null;
}

export interface Phase2DayFlags {
  tradeDate: string;
  executionBleed: boolean;
  flipStormRaw: boolean;
  dayCautionAmd: boolean;
  twoPlusFlags: boolean;
}

interface AmdAsianSlice {
  asianIsFlat: boolean | null;
  accumulationQuality: number | null;
  asianNetPips: number | null;
  asianRangePips: number | null;
}

const dayFlagsCache = new Map<string, { flags: Phase2DayFlags; cachedAtMs: number }>();
const CACHE_TTL_MS = 5 * 60_000;

function normDir(raw: string): 'long' | 'short' | null {
  const d = raw.toLowerCase();
  if (d === 'long' || d === 'short') return d;
  return null;
}

function isBefore10Utc(ms: number): boolean {
  return new Date(ms).getUTCHours() < 10;
}

function buildTimeline(fills: TimelineEntry[], blocks: TimelineEntry[]): TimelineEntry[] {
  const seen = new Set<string>();
  const merged = [...fills, ...blocks].sort((a, b) => a.atMs - b.atMs);
  const out: TimelineEntry[] = [];
  for (const row of merged) {
    const minuteKey = `${new Date(row.atMs).toISOString().slice(0, 16)}|${row.direction}|${row.kind}`;
    if (seen.has(minuteKey)) continue;
    seen.add(minuteKey);
    out.push(row);
  }
  return out;
}

function detectFlipStorm(timeline: TimelineEntry[], minChanges = 2): boolean {
  if (timeline.length < 2) return false;
  let best = 0;
  for (let i = 0; i < timeline.length; i++) {
    const start = timeline[i]!.atMs;
    const window = timeline.filter((e) => e.atMs >= start && e.atMs <= start + 90 * 60_000);
    let changes = 0;
    for (let j = 1; j < window.length; j++) {
      if (window[j]!.direction !== window[j - 1]!.direction) changes += 1;
    }
    if (changes > best) best = changes;
  }
  return best >= minChanges;
}

function computeDayCaution(amd: AmdAsianSlice | null): boolean {
  if (!amd) return false;
  const dirRatio =
    amd.asianRangePips != null && amd.asianRangePips > 0 && amd.asianNetPips != null
      ? Math.abs(amd.asianNetPips) / amd.asianRangePips
      : null;
  return (
    amd.asianIsFlat === true ||
    (amd.accumulationQuality != null && amd.accumulationQuality >= 0.7) ||
    (dirRatio != null && dirRatio < 0.25)
  );
}

function computeFlagsFromRows(
  tradeDate: string,
  bleedFills: TimelineEntry[],
  blocks: TimelineEntry[],
  amd: AmdAsianSlice | null,
  timelineFills: TimelineEntry[],
): Phase2DayFlags {
  const fillsBefore10 = bleedFills.filter((f) => f.kind === 'fill' && isBefore10Utc(f.atMs));
  const bleedPips = fillsBefore10.reduce((s, f) => s + (f.pnlPips ?? 0), 0);
  const bleedSl = fillsBefore10.filter(
    (f) => f.pnlPips != null && (f.pnlPips <= -9 || f.pnlPips <= -7),
  ).length;
  const executionBleed = bleedSl >= 2 || bleedPips <= -15;

  const timeline = buildTimeline(timelineFills, blocks);
  const flipStormRaw = detectFlipStorm(timeline, 2);
  const dayCautionAmd = computeDayCaution(amd);

  const flagCount = [executionBleed, flipStormRaw, dayCautionAmd].filter(Boolean).length;

  return {
    tradeDate,
    executionBleed,
    flipStormRaw,
    dayCautionAmd,
    twoPlusFlags: flagCount >= 2,
  };
}

async function loadAmdSlice(
  supabase: SupabaseClient,
  tradeDate: string,
): Promise<AmdAsianSlice | null> {
  const { data } = await supabase
    .from('amd_state')
    .select('asian_is_flat, accumulation_quality_score, asian_net_pips, asian_range_pips')
    .eq('trade_date', tradeDate)
    .maybeSingle();
  if (!data) return null;
  return {
    asianIsFlat: data.asian_is_flat as boolean | null,
    accumulationQuality:
      data.accumulation_quality_score != null
        ? Number(data.accumulation_quality_score)
        : null,
    asianNetPips: data.asian_net_pips != null ? Number(data.asian_net_pips) : null,
    asianRangePips: data.asian_range_pips != null ? Number(data.asian_range_pips) : null,
  };
}

async function loadBrokerTimeline(
  supabase: SupabaseClient,
  tradeDate: string,
  brokerId: string,
): Promise<{ bleedFills: TimelineEntry[]; blocks: TimelineEntry[]; timelineFills: TimelineEntry[] }> {
  const dayStart = `${tradeDate}T00:00:00Z`;
  const dayEnd = `${tradeDate}T23:59:59Z`;

  const { data: execRows } = await supabase
    .from('bridge_trade_log')
    .select('signal_received_at, direction, pnl_pips, close_reason, decision, status')
    .eq('engine_id', 'omega')
    .eq('broker_id', brokerId)
    .eq('decision', 'EXECUTED')
    .gte('signal_received_at', dayStart)
    .lte('signal_received_at', dayEnd);

  const { data: blockRows } = await supabase
    .from('bridge_trade_log')
    .select('signal_received_at, created_at, direction, block_reason, decision')
    .eq('engine_id', 'omega')
    .eq('broker_id', brokerId)
    .eq('decision', 'BLOCKED')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd);

  const bleedFills: TimelineEntry[] = [];
  const timelineFills: TimelineEntry[] = [];

  for (const row of execRows ?? []) {
    const dir = normDir(String(row.direction));
    const signalAt = String(row.signal_received_at);
    if (!dir || !signalAt) continue;
    const entry: TimelineEntry = {
      atMs: Date.parse(signalAt),
      direction: dir,
      kind: 'fill',
      pnlPips:
        row.status === 'closed' && row.pnl_pips != null ? Number(row.pnl_pips) : null,
    };
    timelineFills.push(entry);
    if (row.status === 'closed' && row.pnl_pips != null) {
      bleedFills.push({ ...entry, pnlPips: Number(row.pnl_pips) });
    }
  }

  const blocks: TimelineEntry[] = [];
  for (const row of blockRows ?? []) {
    const reason = String(row.block_reason ?? '');
    if (!reason.includes('OMEGA_TRADE_OPEN') && !reason.includes('LANE_B')) continue;
    const dir = normDir(String(row.direction));
    const signalAt = String(row.signal_received_at ?? row.created_at);
    if (!dir || !signalAt) continue;
    blocks.push({
      atMs: Date.parse(signalAt),
      direction: dir,
      kind: 'block',
      pnlPips: null,
    });
  }

  return { bleedFills, blocks, timelineFills };
}

export async function loadPhase2DayFlagsForBroker(
  supabase: SupabaseClient,
  tradeDate: string,
  brokerId: string = OMEGA_LANE_B_BROKER_ID,
): Promise<Phase2DayFlags> {
  const cacheKey = `${brokerId}|${tradeDate}`;
  const cached = dayFlagsCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAtMs < CACHE_TTL_MS) {
    return cached.flags;
  }

  const [timeline, amd] = await Promise.all([
    loadBrokerTimeline(supabase, tradeDate, brokerId),
    loadAmdSlice(supabase, tradeDate),
  ]);

  const flags = computeFlagsFromRows(
    tradeDate,
    timeline.bleedFills,
    timeline.blocks,
    amd,
    timeline.timelineFills,
  );

  dayFlagsCache.set(cacheKey, { flags, cachedAtMs: Date.now() });
  return flags;
}

export function utcTradeDateFromIso(iso: string): string {
  return iso.slice(0, 10);
}
