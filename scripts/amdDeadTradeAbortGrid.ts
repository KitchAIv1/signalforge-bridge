/**
 * AMD dead-trade abort grid search.
 * Rule tested: at checkMinutes after entry, if the trade's max favorable
 * excursion so far is below armPips, force-close at that M5 close.
 * Otherwise keep the actual live outcome. Mirrors the AO dead-crack abort.
 * Run: npx tsx scripts/amdDeadTradeAbortGrid.ts
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
const CHECK_MINUTES = [45, 60, 75, 90, 105, 120, 150];
const ARM_PIPS = [2, 3, 4, 5, 6];

interface TradeRow {
  created_at: string;
  closed_at: string | null;
  duration_minutes: number | null;
  direction: string | null;
  amd_tag: string | null;
  result: string | null;
  fill_price: number | null;
  pnl_pips: number | null;
  pnl_dollars: number | null;
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

function round(value: number | null, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function fetchClosedTrades(sb: SupabaseClient): Promise<TradeRow[]> {
  const cols = [
    'created_at,closed_at,duration_minutes,direction,amd_tag,result',
    'fill_price,pnl_pips,pnl_dollars,units',
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
    candlesByDate.set(row.trade_date, parseCandles(row.candles));
  }
  return candlesByDate;
}

function parseCandles(rawCandles: Array<Record<string, unknown>>): M5Candle[] {
  const parsed: M5Candle[] = [];
  for (const raw of rawCandles) {
    const mid = (raw.mid ?? raw) as Record<string, unknown>;
    const high = num(mid.h);
    const low = num(mid.l);
    const close = num(mid.c);
    const timeMs = raw.time ? Date.parse(String(raw.time)) : NaN;
    if (high == null || low == null || close == null || !Number.isFinite(timeMs)) continue;
    parsed.push({ timeMs, high, low, close });
  }
  return parsed.sort((a, b) => a.timeMs - b.timeMs);
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

interface AbortDecision {
  aborted: boolean;
  pips: number;
}

/** Apply the dead-trade abort rule to one trade. */
function applyAbortRule(
  trade: TradeRow,
  candles: M5Candle[] | undefined,
  checkMinutes: number,
  armPips: number,
): AbortDecision | null {
  const actualPips = num(trade.pnl_pips)!;
  const holdMinutes = holdMinutesOf(trade);
  if (holdMinutes <= checkMinutes) return { aborted: false, pips: actualPips };
  if (!candles) return null;
  const entryMs = Date.parse(trade.created_at);
  const checkMs = entryMs + checkMinutes * 60000;
  const fill = num(trade.fill_price)!;
  const direction = trade.direction!;
  let mfeSoFar = 0;
  let closeAtCheck: number | null = null;
  for (const candle of candles) {
    if (candle.timeMs < entryMs - 5 * 60000 || candle.timeMs > checkMs) continue;
    const favorable = signedPips(direction, fill, direction === 'LONG' ? candle.high : candle.low);
    if (favorable > mfeSoFar) mfeSoFar = favorable;
    closeAtCheck = candle.close;
  }
  if (closeAtCheck == null) return null;
  if (mfeSoFar >= armPips) return { aborted: false, pips: actualPips };
  return { aborted: true, pips: signedPips(direction, fill, closeAtCheck) };
}

interface GridCell {
  checkMinutes: number;
  armPips: number;
  n: number;
  aborts: number;
  winnersAborted: number;
  actualPips: number | null;
  rulePips: number | null;
  improvementPips: number | null;
  ruleDollarsApprox: number | null;
}

function evaluateCell(
  trades: TradeRow[],
  candlesByDate: Map<string, M5Candle[]>,
  checkMinutes: number,
  armPips: number,
): GridCell {
  let actualTotal = 0;
  let ruleTotal = 0;
  let ruleDollars = 0;
  let aborts = 0;
  let winnersAborted = 0;
  let n = 0;
  for (const trade of trades) {
    const candles = candlesByDate.get(trade.created_at.slice(0, 10));
    const decision = applyAbortRule(trade, candles, checkMinutes, armPips);
    if (decision == null) continue;
    n += 1;
    actualTotal += num(trade.pnl_pips)!;
    ruleTotal += decision.pips;
    const dollarsPerPip = Math.abs(num(trade.units) ?? 0) * PIP;
    ruleDollars += decision.aborted ? decision.pips * dollarsPerPip : num(trade.pnl_dollars) ?? 0;
    if (decision.aborted) {
      aborts += 1;
      if (trade.result === 'win') winnersAborted += 1;
    }
  }
  return {
    checkMinutes,
    armPips,
    n,
    aborts,
    winnersAborted,
    actualPips: round(actualTotal),
    rulePips: round(ruleTotal),
    improvementPips: round(ruleTotal - actualTotal),
    ruleDollarsApprox: round(ruleDollars),
  };
}

async function main(): Promise<void> {
  loadEnv();
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const trades = await fetchClosedTrades(sb);
  const tradeDates = [...new Set(trades.map((t) => t.created_at.slice(0, 10)))];
  const candlesByDate = await fetchM5CandlesByDate(sb, tradeDates);

  const grid: GridCell[] = [];
  for (const checkMinutes of CHECK_MINUTES) {
    for (const armPips of ARM_PIPS) {
      grid.push(evaluateCell(trades, candlesByDate, checkMinutes, armPips));
    }
  }
  grid.sort((a, b) => (b.improvementPips ?? 0) - (a.improvementPips ?? 0));

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      trades: trades.length,
      note: 'rule: at checkMinutes, if MFE-so-far < armPips, close at M5 close; else keep actual outcome',
    },
    grid,
  };
  writeFileSync(
    join('scripts/output', 'amd_dead_trade_abort_grid.json'),
    JSON.stringify(report, null, 2),
  );
  console.table(grid);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
