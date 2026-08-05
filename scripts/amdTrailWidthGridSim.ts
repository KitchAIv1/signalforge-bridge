/**
 * AMD trail recalibration grid: replays live engine_amd trades at M5
 * resolution over the stored distribution-window candles, simulating
 * trail variants (arm threshold A, giveback G) with 15-pip hard SL,
 * optionally stacked with the 60m/4p dead-trade abort.
 * Pessimistic within-candle ordering: SL, then trail vs previous peak,
 * then peak update. Trades open at window end exit on the last M5 close.
 * Run: npx tsx scripts/amdTrailWidthGridSim.ts
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
const HARD_SL_PIPS = 15;
const ABORT_CHECK_MINUTES = 60;
const ABORT_ARM_PIPS = 4;
const ARM_THRESHOLDS = [3, 4, 5, 6];
const GIVEBACKS = [3, 4, 5, 6, 7, 8, 10];

interface TradeRow {
  created_at: string;
  direction: string | null;
  fill_price: number | null;
  pnl_pips: number | null;
  units: number | null;
}

interface M5Candle {
  timeMs: number;
  high: number;
  low: number;
  close: number;
}

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchClosedTrades(sb: SupabaseClient): Promise<TradeRow[]> {
  const { data, error } = await sb
    .from('bridge_trade_log')
    .select('created_at,direction,fill_price,pnl_pips,units,result,decision')
    .eq('engine_id', 'engine_amd')
    .eq('decision', 'EXECUTED')
    .order('created_at', { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Array<TradeRow & { result: string | null }>;
  return rows.filter(
    (t) => (t.pnl_pips != null || t.result != null) && t.fill_price != null && t.direction != null,
  );
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
    const parsed: M5Candle[] = [];
    for (const raw of row.candles) {
      const mid = (raw.mid ?? raw) as Record<string, unknown>;
      const high = num(mid.h);
      const low = num(mid.l);
      const close = num(mid.c);
      const timeMs = raw.time ? Date.parse(String(raw.time)) : NaN;
      if (high == null || low == null || close == null || !Number.isFinite(timeMs)) continue;
      parsed.push({ timeMs, high, low, close });
    }
    candlesByDate.set(row.trade_date, parsed.sort((a, b) => a.timeMs - b.timeMs));
  }
  return candlesByDate;
}

function signedPips(direction: string, fromPrice: number, toPrice: number): number {
  const raw = (toPrice - fromPrice) / PIP;
  return direction === 'LONG' ? raw : -raw;
}

interface TrailVariant {
  armPips: number;
  givebackPips: number;
  useAbort: boolean;
}

/** Replay one trade under a trail variant; returns exit pips. */
function replayTrailVariant(
  trade: TradeRow,
  candles: M5Candle[],
  variant: TrailVariant,
): number | null {
  const entryMs = Date.parse(trade.created_at);
  const fill = trade.fill_price!;
  const direction = trade.direction!;
  let peakGain = 0;
  let lastClose: number | null = null;
  for (const candle of candles) {
    if (candle.timeMs < entryMs - 5 * 60000) continue;
    const adverse = signedPips(direction, fill, direction === 'LONG' ? candle.low : candle.high);
    if (adverse <= -HARD_SL_PIPS) return -HARD_SL_PIPS;
    if (peakGain >= variant.armPips && adverse <= peakGain - variant.givebackPips) {
      return peakGain - variant.givebackPips;
    }
    const favorable = signedPips(direction, fill, direction === 'LONG' ? candle.high : candle.low);
    if (favorable > peakGain) peakGain = favorable;
    const minutesIn = (candle.timeMs - entryMs) / 60000;
    if (variant.useAbort && minutesIn >= ABORT_CHECK_MINUTES && peakGain < ABORT_ARM_PIPS) {
      return signedPips(direction, fill, candle.close);
    }
    lastClose = candle.close;
  }
  if (lastClose == null) return null;
  return signedPips(direction, fill, lastClose);
}

interface GridCell {
  armPips: number;
  givebackPips: number;
  abort: boolean;
  n: number;
  winRatePct: number;
  totalPips: number;
  avgWinPips: number;
  avgLossPips: number;
  totalDollarsApprox: number;
}

function evaluateVariant(
  variant: TrailVariant,
  trades: TradeRow[],
  candlesByDate: Map<string, M5Candle[]>,
): GridCell {
  let total = 0;
  let dollars = 0;
  let n = 0;
  const winPips: number[] = [];
  const lossPips: number[] = [];
  for (const trade of trades) {
    const candles = candlesByDate.get(trade.created_at.slice(0, 10));
    if (!candles) continue;
    const pips = replayTrailVariant(trade, candles, variant);
    if (pips == null) continue;
    n += 1;
    total += pips;
    dollars += Math.abs(num(trade.units) ?? 0) * PIP * pips;
    if (pips > 0) winPips.push(pips);
    else if (pips < 0) lossPips.push(pips);
  }
  const avg = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  return {
    armPips: variant.armPips,
    givebackPips: variant.givebackPips,
    abort: variant.useAbort,
    n,
    winRatePct: +((winPips.length / Math.max(1, winPips.length + lossPips.length)) * 100).toFixed(1),
    totalPips: +total.toFixed(1),
    avgWinPips: +avg(winPips).toFixed(2),
    avgLossPips: +avg(lossPips).toFixed(2),
    totalDollarsApprox: +dollars.toFixed(0),
  };
}

async function main(): Promise<void> {
  loadEnv();
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const trades = await fetchClosedTrades(sb);
  const tradeDates = [...new Set(trades.map((t) => t.created_at.slice(0, 10)))];
  const candlesByDate = await fetchM5CandlesByDate(sb, tradeDates);

  const grid: GridCell[] = [];
  for (const useAbort of [true, false]) {
    for (const armPips of ARM_THRESHOLDS) {
      for (const givebackPips of GIVEBACKS) {
        grid.push(evaluateVariant({ armPips, givebackPips, useAbort }, trades, candlesByDate));
      }
    }
  }
  const actualPips = trades.reduce((a, t) => a + (num(t.pnl_pips) ?? 0), 0);
  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      trades: trades.length,
      actualLiveTotalPips: +actualPips.toFixed(1),
      note: 'replay truncated at 16:00 UTC window end (exit on last M5 close); pessimistic candle ordering',
    },
    grid: grid.sort((a, b) => b.totalPips - a.totalPips),
  };
  writeFileSync(
    join('scripts/output', 'amd_trail_width_grid.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report.meta, null, 2));
  console.table(report.grid.filter((c) => c.abort).slice(0, 12));
  console.table(report.grid.filter((c) => !c.abort).slice(0, 6));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
