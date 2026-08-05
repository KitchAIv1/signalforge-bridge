/**
 * AMD combined-lever simulation on a small account.
 * Replays live engine_amd trades at M5 resolution with stacked rules:
 *   V0 as-traded | V1 +dead-trade abort (60m/4p) | V2 +10-pip hard SL
 * Sizing: risk = equity x riskPct x amd_size_multiplier over the SL distance,
 * so a tighter SL buys proportionally more units for the same dollar risk.
 * Candle walk is pessimistic: adverse breach checked before favorable move.
 * Run: npx tsx scripts/amdCombinedLeverSim.ts
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

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
const START_EQUITY = Number(process.env.SIM_EQUITY ?? 200);
const SPREAD_PIPS = Number(process.env.SIM_SPREAD_PIPS ?? 0.75);
const RISK_PCT = Number(process.env.SIM_RISK_PCT ?? 0.02);
const ABORT_CHECK_MINUTES = 60;
const ABORT_ARM_PIPS = 4;

interface TradeRow {
  created_at: string;
  closed_at: string | null;
  duration_minutes: number | null;
  direction: string | null;
  result: string | null;
  fill_price: number | null;
  pnl_pips: number | null;
  amd_size_multiplier: number | null;
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
    .select(
      'created_at,closed_at,duration_minutes,direction,result,fill_price,pnl_pips,amd_size_multiplier',
    )
    .eq('engine_id', 'engine_amd')
    .eq('decision', 'EXECUTED')
    .order('created_at', { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as TradeRow[];
  return rows.filter((t) => t.pnl_pips != null && t.fill_price != null && t.direction != null);
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

function holdMinutesOf(trade: TradeRow): number {
  const stored = num(trade.duration_minutes);
  if (stored != null) return stored;
  if (!trade.closed_at) return 360;
  return (Date.parse(trade.closed_at) - Date.parse(trade.created_at)) / 60000;
}

function signedPips(direction: string, fromPrice: number, toPrice: number): number {
  const raw = (toPrice - fromPrice) / PIP;
  return direction === 'LONG' ? raw : -raw;
}

/**
 * M5 walk of one trade under {abort, hardSlPips} rules.
 * Pessimistic within-candle ordering: SL breach is checked before MFE update.
 */
function replayTradePips(
  trade: TradeRow,
  candles: M5Candle[] | undefined,
  useAbort: boolean,
  hardSlPips: number,
): number {
  const actualPips = num(trade.pnl_pips)!;
  if (!candles) return Math.max(actualPips, -hardSlPips);
  const entryMs = Date.parse(trade.created_at);
  const exitMs = entryMs + holdMinutesOf(trade) * 60000;
  const fill = num(trade.fill_price)!;
  const direction = trade.direction!;
  let mfe = 0;
  for (const candle of candles) {
    if (candle.timeMs < entryMs - 5 * 60000 || candle.timeMs > exitMs) continue;
    const adverse = signedPips(direction, fill, direction === 'LONG' ? candle.low : candle.high);
    if (adverse <= -hardSlPips) return -hardSlPips;
    const favorable = signedPips(direction, fill, direction === 'LONG' ? candle.high : candle.low);
    if (favorable > mfe) mfe = favorable;
    const minutesIn = (candle.timeMs - entryMs) / 60000;
    if (useAbort && minutesIn >= ABORT_CHECK_MINUTES && mfe < ABORT_ARM_PIPS) {
      return signedPips(direction, fill, candle.close);
    }
  }
  return Math.max(actualPips, -hardSlPips);
}

interface Variant {
  label: string;
  useAbort: boolean;
  hardSlPips: number;
}

function runVariant(
  variant: Variant,
  trades: TradeRow[],
  candlesByDate: Map<string, M5Candle[]>,
) {
  let equity = START_EQUITY;
  let peak = START_EQUITY;
  let maxDrawdownPct = 0;
  let wins = 0;
  let losses = 0;
  const rMultiples: number[] = [];
  for (const trade of trades) {
    const multiplier = num(trade.amd_size_multiplier) ?? 1;
    const riskDollars = equity * RISK_PCT * (multiplier > 0 ? multiplier : 1);
    const units = riskDollars / (variant.hardSlPips * PIP);
    const candles = candlesByDate.get(trade.created_at.slice(0, 10));
    const pips =
      replayTradePips(trade, candles, variant.useAbort, variant.hardSlPips) - SPREAD_PIPS;
    const pnl = units * pips * PIP;
    rMultiples.push(pnl / riskDollars);
    if (pnl > 0) wins += 1;
    else if (pnl < 0) losses += 1;
    equity += pnl;
    if (equity > peak) peak = equity;
    const drawdown = ((peak - equity) / peak) * 100;
    if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;
  }
  const avgR = rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length;
  return {
    label: variant.label,
    finalEquity: +equity.toFixed(2),
    netPct: +(((equity - START_EQUITY) / START_EQUITY) * 100).toFixed(1),
    winRatePct: +((wins / (wins + losses)) * 100).toFixed(1),
    maxDrawdownPct: +maxDrawdownPct.toFixed(1),
    expectancyR: +avgR.toFixed(3),
  };
}

async function main(): Promise<void> {
  loadEnv();
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const trades = await fetchClosedTrades(sb);
  const tradeDates = [...new Set(trades.map((t) => t.created_at.slice(0, 10)))];
  const candlesByDate = await fetchM5CandlesByDate(sb, tradeDates);

  const variants: Variant[] = [
    { label: 'V0 as-traded (SL15)', useAbort: false, hardSlPips: 15 },
    { label: 'V1 abort 60m/4p (SL15)', useAbort: true, hardSlPips: 15 },
    { label: 'V2 abort + SL10', useAbort: true, hardSlPips: 10 },
    { label: 'V3 abort + SL12', useAbort: true, hardSlPips: 12 },
  ];
  const results = variants.map((v) => runVariant(v, trades, candlesByDate));
  console.log(
    JSON.stringify(
      {
        assumptions: {
          startEquity: START_EQUITY,
          spreadPips: SPREAD_PIPS,
          riskPct: RISK_PCT,
          trades: trades.length,
          note: 'sizing scales with 1/SL; pessimistic candle walk (SL breach before MFE)',
        },
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
