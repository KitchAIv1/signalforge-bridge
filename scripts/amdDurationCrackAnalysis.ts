/**
 * AMD duration crack analysis.
 * Tests the hypothesis that engine_amd trades held beyond N minutes
 * (especially 150) are losers, using live trades + stored M5 candles
 * for force-close counterfactuals and MFE/MAE timing.
 * Run: npx tsx scripts/amdDurationCrackAnalysis.ts
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function loadEnv(): void {
  try {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch {
    /* optional */
  }
}

const PIP = 0.0001;
const CUTOFFS_MIN = [60, 90, 120, 150, 180, 210];

interface TradeRow {
  id: string;
  created_at: string;
  closed_at: string | null;
  duration_minutes: number | null;
  direction: string | null;
  amd_tag: string | null;
  daily_bias_alignment: string | null;
  decision: string | null;
  status: string | null;
  result: string | null;
  fill_price: number | null;
  exit_price: number | null;
  pnl_pips: number | null;
  pnl_dollars: number | null;
  close_reason: string | null;
  amd_size_multiplier: number | null;
  units: number | null;
}

interface M5Candle {
  timeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface TradeAnalysis {
  date: string;
  entryUtc: string;
  direction: string;
  tag: string;
  alignment: string;
  closeReason: string;
  result: string;
  holdMinutes: number;
  pnlPips: number;
  pnlDollars: number;
  mfePips: number | null;
  maePips: number | null;
  minutesToMfe: number | null;
  cutoffPips: Record<string, number | null>;
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value: number | null, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function fetchClosedTrades(sb: SupabaseClient): Promise<TradeRow[]> {
  const cols = [
    'id,created_at,closed_at,duration_minutes,direction,amd_tag',
    'daily_bias_alignment,decision,status,result,fill_price,exit_price',
    'pnl_pips,pnl_dollars,close_reason,amd_size_multiplier,units',
  ].join(',');
  const { data, error } = await sb
    .from('bridge_trade_log')
    .select(cols)
    .eq('engine_id', 'engine_amd')
    .eq('decision', 'EXECUTED')
    .order('created_at', { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as TradeRow[];
  return rows.filter((t) => t.pnl_pips != null || t.result != null);
}

async function fetchM5CandlesByDate(
  sb: SupabaseClient,
  tradeDates: string[],
): Promise<Map<string, M5Candle[]>> {
  const { data, error } = await sb
    .from('amd_m5_distribution_candles')
    .select('trade_date,candles,fetch_status')
    .in('trade_date', tradeDates);
  if (error) throw new Error(error.message);
  const candlesByDate = new Map<string, M5Candle[]>();
  for (const row of (data ?? []) as Array<{
    trade_date: string;
    candles: Array<Record<string, unknown>>;
    fetch_status: string;
  }>) {
    if (row.fetch_status !== 'success') continue;
    candlesByDate.set(row.trade_date, parseCandles(row.candles));
  }
  return candlesByDate;
}

function parseCandles(rawCandles: Array<Record<string, unknown>>): M5Candle[] {
  const parsed: M5Candle[] = [];
  for (const raw of rawCandles) {
    const mid = (raw.mid ?? raw) as Record<string, unknown>;
    const open = num(mid.o);
    const high = num(mid.h);
    const low = num(mid.l);
    const close = num(mid.c);
    const timeMs = raw.time ? Date.parse(String(raw.time)) : NaN;
    if (open == null || high == null || low == null || close == null) continue;
    if (!Number.isFinite(timeMs)) continue;
    parsed.push({ timeMs, open, high, low, close });
  }
  return parsed.sort((a, b) => a.timeMs - b.timeMs);
}

function holdMinutesOf(trade: TradeRow): number | null {
  const stored = num(trade.duration_minutes);
  if (stored != null) return stored;
  if (!trade.closed_at) return null;
  return (Date.parse(trade.closed_at) - Date.parse(trade.created_at)) / 60000;
}

function signedPips(direction: string, fromPrice: number, toPrice: number): number {
  const raw = (toPrice - fromPrice) / PIP;
  return direction === 'LONG' ? raw : -raw;
}

/** Close of the last candle at or before entry + offsetMinutes. */
function priceAtOffset(
  candles: M5Candle[],
  entryMs: number,
  offsetMinutes: number,
): number | null {
  const targetMs = entryMs + offsetMinutes * 60000;
  let price: number | null = null;
  for (const candle of candles) {
    if (candle.timeMs > targetMs) break;
    if (candle.timeMs >= entryMs - 5 * 60000) price = candle.close;
  }
  return price;
}

function excursionStats(
  candles: M5Candle[],
  trade: TradeRow,
  holdMinutes: number,
): { mfePips: number | null; maePips: number | null; minutesToMfe: number | null } {
  const entryMs = Date.parse(trade.created_at);
  const exitMs = entryMs + holdMinutes * 60000;
  const fill = num(trade.fill_price);
  const direction = trade.direction ?? 'LONG';
  if (fill == null) return { mfePips: null, maePips: null, minutesToMfe: null };
  let mfe = -Infinity;
  let mae = Infinity;
  let minutesToMfe: number | null = null;
  for (const candle of candles) {
    if (candle.timeMs < entryMs - 5 * 60000 || candle.timeMs > exitMs) continue;
    const favorable = signedPips(direction, fill, direction === 'LONG' ? candle.high : candle.low);
    const adverse = signedPips(direction, fill, direction === 'LONG' ? candle.low : candle.high);
    if (favorable > mfe) {
      mfe = favorable;
      minutesToMfe = Math.max(0, (candle.timeMs - entryMs) / 60000);
    }
    if (adverse < mae) mae = adverse;
  }
  if (!Number.isFinite(mfe)) return { mfePips: null, maePips: null, minutesToMfe: null };
  return { mfePips: mfe, maePips: mae, minutesToMfe };
}

function counterfactualPips(
  candles: M5Candle[] | undefined,
  trade: TradeRow,
  holdMinutes: number,
  cutoffMinutes: number,
): number | null {
  const actualPips = num(trade.pnl_pips);
  if (holdMinutes <= cutoffMinutes || actualPips == null) return actualPips;
  const fill = num(trade.fill_price);
  if (!candles || fill == null || !trade.direction) return null;
  const exitPrice = priceAtOffset(candles, Date.parse(trade.created_at), cutoffMinutes);
  if (exitPrice == null) return null;
  return signedPips(trade.direction, fill, exitPrice);
}

function analyzeTrade(
  trade: TradeRow,
  candlesByDate: Map<string, M5Candle[]>,
): TradeAnalysis | null {
  const holdMinutes = holdMinutesOf(trade);
  if (holdMinutes == null) return null;
  const date = trade.created_at.slice(0, 10);
  const candles = candlesByDate.get(date);
  const excursion = candles
    ? excursionStats(candles, trade, holdMinutes)
    : { mfePips: null, maePips: null, minutesToMfe: null };
  const cutoffPips: Record<string, number | null> = {};
  for (const cutoff of CUTOFFS_MIN) {
    cutoffPips[String(cutoff)] = round(
      counterfactualPips(candles, trade, holdMinutes, cutoff),
    );
  }
  return {
    date,
    entryUtc: trade.created_at.slice(11, 16),
    direction: trade.direction ?? '?',
    tag: trade.amd_tag ?? '?',
    alignment: trade.daily_bias_alignment ?? 'null',
    closeReason: trade.close_reason ?? '?',
    result: trade.result ?? '?',
    holdMinutes: Math.round(holdMinutes),
    pnlPips: round(num(trade.pnl_pips)) ?? 0,
    pnlDollars: round(num(trade.pnl_dollars)) ?? 0,
    mfePips: round(excursion.mfePips),
    maePips: round(excursion.maePips),
    minutesToMfe: excursion.minutesToMfe == null ? null : Math.round(excursion.minutesToMfe),
    cutoffPips,
  };
}

function bucketLabel(holdMinutes: number): string {
  if (holdMinutes < 30) return '000-030m';
  if (holdMinutes < 60) return '030-060m';
  if (holdMinutes < 90) return '060-090m';
  if (holdMinutes < 120) return '090-120m';
  if (holdMinutes < 150) return '120-150m';
  if (holdMinutes < 180) return '150-180m';
  if (holdMinutes < 240) return '180-240m';
  return '240m+';
}

function bucketStats(rows: TradeAnalysis[]) {
  const wins = rows.filter((r) => r.result === 'win').length;
  const losses = rows.filter((r) => r.result === 'loss').length;
  return {
    n: rows.length,
    wins,
    losses,
    breakeven: rows.length - wins - losses,
    winRatePct: round(wins + losses > 0 ? (wins / (wins + losses)) * 100 : null),
    totalPips: round(rows.reduce((a, r) => a + r.pnlPips, 0)),
    totalDollars: round(rows.reduce((a, r) => a + r.pnlDollars, 0)),
    avgMfePips: round(avg(rows.map((r) => r.mfePips))),
    avgMinutesToMfe: round(avg(rows.map((r) => r.minutesToMfe))),
  };
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function summarizeCutoff(rows: TradeAnalysis[], cutoff: number) {
  const affected = rows.filter((r) => r.holdMinutes > cutoff);
  const cfKey = String(cutoff);
  const withCf = rows.filter((r) => r.cutoffPips[cfKey] != null);
  const actualTotal = withCf.reduce((a, r) => a + r.pnlPips, 0);
  const cfTotal = withCf.reduce((a, r) => a + (r.cutoffPips[cfKey] ?? 0), 0);
  const affectedActual = affected.reduce((a, r) => a + r.pnlPips, 0);
  return {
    cutoffMinutes: cutoff,
    tradesAffected: affected.length,
    affectedWins: affected.filter((r) => r.result === 'win').length,
    affectedLosses: affected.filter((r) => r.result === 'loss').length,
    affectedActualPips: round(affectedActual),
    tradesWithCounterfactual: withCf.length,
    actualTotalPips: round(actualTotal),
    counterfactualTotalPips: round(cfTotal),
    improvementPips: round(cfTotal - actualTotal),
  };
}

function toCsv(rows: TradeAnalysis[]): string {
  const header = [
    'date,entry_utc,direction,tag,alignment,close_reason,result,hold_minutes',
    'pnl_pips,pnl_dollars,mfe_pips,mae_pips,minutes_to_mfe',
    ...CUTOFFS_MIN.map((c) => `cf_${c}m_pips`),
  ].join(',');
  const lines = rows.map((r) =>
    [
      r.date, r.entryUtc, r.direction, r.tag, r.alignment, r.closeReason,
      r.result, r.holdMinutes, r.pnlPips, r.pnlDollars, r.mfePips ?? '',
      r.maePips ?? '', r.minutesToMfe ?? '',
      ...CUTOFFS_MIN.map((c) => r.cutoffPips[String(c)] ?? ''),
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

async function main(): Promise<void> {
  loadEnv();
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const trades = await fetchClosedTrades(sb);
  const tradeDates = [...new Set(trades.map((t) => t.created_at.slice(0, 10)))];
  const candlesByDate = await fetchM5CandlesByDate(sb, tradeDates);

  const analyses = trades
    .map((t) => analyzeTrade(t, candlesByDate))
    .filter((a): a is TradeAnalysis => a != null);

  const buckets: Record<string, TradeAnalysis[]> = {};
  for (const analysis of analyses) {
    (buckets[bucketLabel(analysis.holdMinutes)] ??= []).push(analysis);
  }

  const over150 = analyses.filter((a) => a.holdMinutes > 150);
  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      closedTrades: analyses.length,
      datesWithCandles: candlesByDate.size,
      datesMissingCandles: tradeDates.filter((d) => !candlesByDate.has(d)),
    },
    hypothesis150: {
      tradesOver150m: over150.length,
      wins: over150.filter((a) => a.result === 'win').length,
      losses: over150.filter((a) => a.result === 'loss').length,
      breakeven: over150.filter((a) => a.result === 'breakeven').length,
      totalPips: round(over150.reduce((a, r) => a + r.pnlPips, 0)),
      totalDollars: round(over150.reduce((a, r) => a + r.pnlDollars, 0)),
      detail: over150.map((a) => ({
        date: a.date, entry: a.entryUtc, hold: a.holdMinutes, result: a.result,
        pips: a.pnlPips, dollars: a.pnlDollars, mfe: a.mfePips,
        minToMfe: a.minutesToMfe, close: a.closeReason, tag: a.tag,
      })),
    },
    byDurationBucket: Object.keys(buckets)
      .sort()
      .map((k) => ({ bucket: k, ...bucketStats(buckets[k]) })),
    cutoffCounterfactuals: CUTOFFS_MIN.map((c) => summarizeCutoff(analyses, c)),
    winnerTiming: {
      winners: bucketStats(analyses.filter((a) => a.result === 'win')),
      losers: bucketStats(analyses.filter((a) => a.result === 'loss')),
    },
  };

  writeFileSync(
    join('scripts/output', 'amd_duration_crack_analysis.json'),
    JSON.stringify(report, null, 2),
  );
  writeFileSync(join('scripts/output', 'amd_duration_crack_trades.csv'), toCsv(analyses));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
