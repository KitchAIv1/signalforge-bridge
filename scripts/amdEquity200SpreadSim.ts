/**
 * Replay live engine_amd closed trades on a small account.
 * Starting equity $200, risk = 2% x amd_size_multiplier, spread cost
 * deducted from every trade's pips, equity compounds trade by trade.
 * Variants: as-traded, and with the 60min/4pip dead-trade abort.
 * Run: npx tsx scripts/amdEquity200SpreadSim.ts
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
const SPREAD_PIPS = Number(process.env.SIM_SPREAD_PIPS ?? 1.5);
const RISK_PCT = 0.02;
const HARD_SL_PIPS = 15;
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

/** Pips the trade produces under the 60min/4pip dead-trade abort rule. */
function abortRulePips(trade: TradeRow, candles: M5Candle[] | undefined): number {
  const actualPips = num(trade.pnl_pips) ?? 0;
  if (holdMinutesOf(trade) <= ABORT_CHECK_MINUTES || !candles) return actualPips;
  const fill = num(trade.fill_price);
  const direction = trade.direction;
  if (fill == null || !direction) return actualPips;
  const entryMs = Date.parse(trade.created_at);
  const checkMs = entryMs + ABORT_CHECK_MINUTES * 60000;
  let mfeSoFar = 0;
  let closeAtCheck: number | null = null;
  for (const candle of candles) {
    if (candle.timeMs < entryMs - 5 * 60000 || candle.timeMs > checkMs) continue;
    const favorable = signedPips(direction, fill, direction === 'LONG' ? candle.high : candle.low);
    if (favorable > mfeSoFar) mfeSoFar = favorable;
    closeAtCheck = candle.close;
  }
  if (closeAtCheck == null || mfeSoFar >= ABORT_ARM_PIPS) return actualPips;
  return signedPips(direction, fill, closeAtCheck);
}

interface SimResult {
  label: string;
  finalEquity: number;
  netDollars: number;
  netPct: number;
  peakEquity: number;
  troughEquity: number;
  maxDrawdownPct: number;
  totalSpreadCostDollars: number;
  worstTradeDollars: number;
  bestTradeDollars: number;
}

function runSim(
  label: string,
  trades: TradeRow[],
  pipsForTrade: (trade: TradeRow) => number,
): SimResult {
  let equity = START_EQUITY;
  let peak = START_EQUITY;
  let trough = START_EQUITY;
  let maxDrawdownPct = 0;
  let spreadCost = 0;
  let worst = 0;
  let best = 0;
  for (const trade of trades) {
    const multiplier = num(trade.amd_size_multiplier) ?? 1;
    const riskDollars = equity * RISK_PCT * (multiplier > 0 ? multiplier : 1);
    const units = riskDollars / (HARD_SL_PIPS * PIP);
    const adjustedPips = pipsForTrade(trade) - SPREAD_PIPS;
    const pnl = units * adjustedPips * PIP;
    spreadCost += units * SPREAD_PIPS * PIP;
    equity += pnl;
    if (pnl < worst) worst = pnl;
    if (pnl > best) best = pnl;
    if (equity > peak) peak = equity;
    if (equity < trough) trough = equity;
    const drawdown = ((peak - equity) / peak) * 100;
    if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;
  }
  return {
    label,
    finalEquity: +equity.toFixed(2),
    netDollars: +(equity - START_EQUITY).toFixed(2),
    netPct: +(((equity - START_EQUITY) / START_EQUITY) * 100).toFixed(1),
    peakEquity: +peak.toFixed(2),
    troughEquity: +trough.toFixed(2),
    maxDrawdownPct: +maxDrawdownPct.toFixed(1),
    totalSpreadCostDollars: +spreadCost.toFixed(2),
    worstTradeDollars: +worst.toFixed(2),
    bestTradeDollars: +best.toFixed(2),
  };
}

async function main(): Promise<void> {
  loadEnv();
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const trades = await fetchClosedTrades(sb);
  const tradeDates = [...new Set(trades.map((t) => t.created_at.slice(0, 10)))];
  const candlesByDate = await fetchM5CandlesByDate(sb, tradeDates);

  const asTraded = runSim('as-traded', trades, (t) => num(t.pnl_pips) ?? 0);
  const withAbort = runSim('with 60m/4p abort', trades, (t) =>
    abortRulePips(t, candlesByDate.get(t.created_at.slice(0, 10))),
  );
  const rawPips = trades.reduce((a, t) => a + (num(t.pnl_pips) ?? 0), 0);
  console.log(
    JSON.stringify(
      {
        assumptions: {
          startEquity: START_EQUITY,
          spreadPipsPerTrade: SPREAD_PIPS,
          riskModel: '2% of current equity x amd_size_multiplier, 15p hard SL sizing',
          trades: trades.length,
          rawBookPips: +rawPips.toFixed(1),
          totalSpreadDragPips: +(trades.length * SPREAD_PIPS).toFixed(1),
        },
        results: [asTraded, withAbort],
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
