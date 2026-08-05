/**
 * $200 VT account simulation of the full recalibrated AMD stack:
 * dead-trade abort (60m / 4p) + trail arm 6 / giveback 4 + hard SL variants.
 * Replays live trades on extended OANDA M5 candles (cached by
 * amdReplayFidelityCheck.ts), compounds equity with conviction sizing,
 * deducts spread per trade. Fully offline: reads saved audit trades + cache.
 * Run: npx tsx scripts/amdVt200FullStackSim.ts
 */
import { readFileSync } from 'node:fs';

const PIP = 0.0001;
const START_EQUITY = 200;
const ABORT_CHECK_MINUTES = 60;
const ABORT_ARM_PIPS = 4;
const TRAIL_ARM_PIPS = 6;
const TRAIL_GIVEBACK_PIPS = 4;

interface TradeRow {
  created_at: string;
  decision: string | null;
  direction: string | null;
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

function signedPips(direction: string, fromPrice: number, toPrice: number): number {
  const raw = (toPrice - fromPrice) / PIP;
  return direction === 'LONG' ? raw : -raw;
}

function loadTrades(): TradeRow[] {
  const audit = JSON.parse(
    readFileSync('scripts/output/amd_engine_live_trades_audit.json', 'utf8'),
  ) as { trades: TradeRow[] };
  return audit.trades.filter(
    (t) =>
      t.decision === 'EXECUTED' &&
      t.pnl_pips != null &&
      t.fill_price != null &&
      t.direction != null,
  );
}

function loadCandleCache(): Map<string, M5Candle[]> {
  const cache = JSON.parse(
    readFileSync('scripts/output/amd_extended_m5_cache.json', 'utf8'),
  ) as Record<string, M5Candle[]>;
  return new Map(Object.entries(cache));
}

/** Full-stack replay of one trade; returns exit pips before spread. */
function replayFullStack(
  trade: TradeRow,
  candles: M5Candle[] | undefined,
  hardSlPips: number,
): number {
  if (!candles) return Math.max(trade.pnl_pips!, -hardSlPips);
  const entryMs = Date.parse(trade.created_at);
  const fill = trade.fill_price!;
  const direction = trade.direction!;
  let peakGain = 0;
  let lastClose: number | null = null;
  for (const candle of candles) {
    if (candle.timeMs < entryMs - 5 * 60000) continue;
    const adverse = signedPips(direction, fill, direction === 'LONG' ? candle.low : candle.high);
    if (adverse <= -hardSlPips) return -hardSlPips;
    if (peakGain >= TRAIL_ARM_PIPS && adverse <= peakGain - TRAIL_GIVEBACK_PIPS) {
      return peakGain - TRAIL_GIVEBACK_PIPS;
    }
    const favorable = signedPips(direction, fill, direction === 'LONG' ? candle.high : candle.low);
    if (favorable > peakGain) peakGain = favorable;
    const minutesIn = (candle.timeMs - entryMs) / 60000;
    if (minutesIn >= ABORT_CHECK_MINUTES && peakGain < ABORT_ARM_PIPS) {
      return signedPips(direction, fill, candle.close);
    }
    lastClose = candle.close;
  }
  return lastClose == null ? Math.max(trade.pnl_pips!, -hardSlPips) : signedPips(direction, fill, lastClose);
}

interface ScenarioResult {
  scenario: string;
  finalEquity: number;
  netDollars: number;
  netPct: number;
  maxDrawdownPct: number;
  worstTradeDollars: number;
  bestTradeDollars: number;
}

function runScenario(
  scenario: string,
  trades: TradeRow[],
  candlesByDate: Map<string, M5Candle[]>,
  hardSlPips: number,
  spreadPips: number,
  riskPct: number,
): ScenarioResult {
  let equity = START_EQUITY;
  let peak = START_EQUITY;
  let maxDrawdownPct = 0;
  let worst = 0;
  let best = 0;
  for (const trade of trades) {
    const multiplier = trade.amd_size_multiplier ?? 1;
    const riskDollars = equity * riskPct * (multiplier > 0 ? multiplier : 1);
    const units = riskDollars / (hardSlPips * PIP);
    const candles = candlesByDate.get(trade.created_at.slice(0, 10));
    const pips = replayFullStack(trade, candles, hardSlPips) - spreadPips;
    const pnl = units * pips * PIP;
    equity += pnl;
    if (pnl < worst) worst = pnl;
    if (pnl > best) best = pnl;
    if (equity > peak) peak = equity;
    const drawdown = ((peak - equity) / peak) * 100;
    if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;
  }
  return {
    scenario,
    finalEquity: +equity.toFixed(2),
    netDollars: +(equity - START_EQUITY).toFixed(2),
    netPct: +(((equity - START_EQUITY) / START_EQUITY) * 100).toFixed(1),
    maxDrawdownPct: +maxDrawdownPct.toFixed(1),
    worstTradeDollars: +worst.toFixed(2),
    bestTradeDollars: +best.toFixed(2),
  };
}

function main(): void {
  const trades = loadTrades();
  const candlesByDate = loadCandleCache();
  const scenarios: ScenarioResult[] = [
    runScenario('SL15 | spread 0.75 | risk 2%', trades, candlesByDate, 15, 0.75, 0.02),
    runScenario('SL10 | spread 0.75 | risk 2%', trades, candlesByDate, 10, 0.75, 0.02),
    runScenario('SL10 | spread 1.50 | risk 2%', trades, candlesByDate, 10, 1.5, 0.02),
    runScenario('SL10 | spread 0.75 | risk 4%', trades, candlesByDate, 10, 0.75, 0.04),
    runScenario('SL10 | spread 1.50 | risk 4%', trades, candlesByDate, 10, 1.5, 0.04),
  ];
  console.log(`trades=${trades.length} | stack: abort 60m/4p + trail ${TRAIL_ARM_PIPS}/${TRAIL_GIVEBACK_PIPS}`);
  console.table(scenarios);
}

main();
