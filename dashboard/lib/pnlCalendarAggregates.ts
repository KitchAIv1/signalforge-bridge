import { toDateKeyFromInput } from '@/lib/pnlCalendarFormat';
import type { DaySummary, EquityPoint, PnlTradeRow } from '@/lib/pnlCalendarTypes';

function createEmptyDaySummary(isoDateKey: string): DaySummary {
  return {
    date: isoDateKey,
    trades: [],
    netR: 0,
    netDollars: 0,
    hasNullDollars: false,
    wins: 0,
    losses: 0,
    breakevens: 0,
    omegaNetR: 0,
    rebuildNetR: 0,
    scalperNetR: 0,
    amdNetR: 0,
    omegaInverseNetR: 0,
    winRate: 0,
    longNetR: 0,
    shortNetR: 0,
    longCount: 0,
    shortCount: 0,
    tradeCount: 0,
  };
}

function foldTradeIntoDay(day: DaySummary, trade: PnlTradeRow): void {
  day.trades.push(trade);
  day.tradeCount += 1;
  const rComponent = trade.pnl_r ?? 0;
  day.netR += rComponent;
  if (trade.pnl_dollars === null || trade.pnl_dollars === undefined) {
    day.hasNullDollars = true;
  } else {
    day.netDollars += trade.pnl_dollars;
  }
  const verdict = trade.result?.toLowerCase();
  if (verdict === 'win') day.wins += 1;
  else if (verdict === 'loss') day.losses += 1;
  else day.breakevens += 1;
  if (trade.engine_id === 'omega') day.omegaNetR += rComponent;
  if (trade.engine_id === 'engine_rebuild') day.rebuildNetR += rComponent;
  if (trade.engine_id === 'scalper') day.scalperNetR += rComponent;
  if (trade.engine_id === 'engine_amd') day.amdNetR += rComponent;
  if (trade.engine_id === 'omega_inverse') day.omegaInverseNetR += rComponent;
  const side = trade.direction?.toLowerCase();
  if (side === 'long') {
    day.longNetR += rComponent;
    day.longCount += 1;
  }
  if (side === 'short') {
    day.shortNetR += rComponent;
    day.shortCount += 1;
  }
}

function roundDayRollups(day: DaySummary): void {
  const totalOutcomes = day.wins + day.losses + day.breakevens;
  day.winRate = totalOutcomes > 0 ? Math.round((day.wins / totalOutcomes) * 100) : 0;
  day.netR = Math.round(day.netR * 1000) / 1000;
  day.netDollars = Math.round(day.netDollars * 100) / 100;
  day.omegaNetR = Math.round(day.omegaNetR * 1000) / 1000;
  day.rebuildNetR = Math.round(day.rebuildNetR * 1000) / 1000;
  day.scalperNetR = Math.round(day.scalperNetR * 1000) / 1000;
  day.amdNetR = Math.round(day.amdNetR * 1000) / 1000;
  day.omegaInverseNetR = Math.round(day.omegaInverseNetR * 1000) / 1000;
}

export function buildDaySummaries(trades: PnlTradeRow[]): Map<string, DaySummary> {
  const byDay = new Map<string, DaySummary>();
  for (const trade of trades) {
    const key = toDateKeyFromInput(trade.created_at);
    if (!byDay.has(key)) {
      byDay.set(key, createEmptyDaySummary(key));
    }
    foldTradeIntoDay(byDay.get(key)!, trade);
  }
  for (const day of byDay.values()) {
    roundDayRollups(day);
  }
  return byDay;
}

export function buildEquityCurve(trades: PnlTradeRow[]): EquityPoint[] {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  let cumR = 0;
  let omegaR = 0;
  let rebuildR = 0;
  let amdR = 0;
  let omegaInverseR = 0;
  const points: EquityPoint[] = [
    { label: 'Apr 30', cumR: 0, omegaR: 0, rebuildR: 0, amdR: 0, omegaInverseR: 0 },
  ];
  for (const trade of sorted) {
    const rComponent = trade.pnl_r ?? 0;
    cumR += rComponent;
    if (trade.engine_id === 'omega') omegaR += rComponent;
    if (trade.engine_id === 'engine_rebuild') rebuildR += rComponent;
    if (trade.engine_id === 'engine_amd') amdR += rComponent;
    if (trade.engine_id === 'omega_inverse') omegaInverseR += rComponent;
    const stamp = new Date(trade.created_at);
    const label = stamp.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    points.push({
      label,
      cumR: Math.round(cumR * 100) / 100,
      omegaR: Math.round(omegaR * 100) / 100,
      rebuildR: Math.round(rebuildR * 100) / 100,
      amdR: Math.round(amdR * 100) / 100,
      omegaInverseR: Math.round(omegaInverseR * 100) / 100,
    });
  }
  return points;
}
