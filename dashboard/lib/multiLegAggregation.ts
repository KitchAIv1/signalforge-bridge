import type { PnlTradeRow } from '@/lib/pnlCalendarTypes';

export type EffectiveTradeOutcome = 'win' | 'loss' | 'breakeven';

export type EffectiveTrade = {
  key: string;
  result: EffectiveTradeOutcome;
  direction: string | null;
  legs: PnlTradeRow[];
};

export function isMultiLegTrade(trade: PnlTradeRow): boolean {
  return trade.leg_type != null && trade.signal_id != null;
}

export function aggregateMultiLegResult(legs: PnlTradeRow[]): EffectiveTradeOutcome {
  const totalPnl = legs.reduce((sum, leg) => sum + (leg.pnl_dollars ?? 0), 0);
  if (totalPnl > 0) return 'win';
  if (totalPnl < 0) return 'loss';
  return 'breakeven';
}

function resultFromSingleTrade(trade: PnlTradeRow): EffectiveTradeOutcome {
  const verdict = trade.result?.toLowerCase();
  if (verdict === 'win') return 'win';
  if (verdict === 'loss') return 'loss';
  return 'breakeven';
}

export function groupMultiLegTrades(trades: PnlTradeRow[]): EffectiveTrade[] {
  const multiLegGroups = new Map<string, PnlTradeRow[]>();
  const singleLegTrades: PnlTradeRow[] = [];

  for (const trade of trades) {
    if (isMultiLegTrade(trade)) {
      const signalId = trade.signal_id as string;
      const existingLegs = multiLegGroups.get(signalId) ?? [];
      existingLegs.push(trade);
      multiLegGroups.set(signalId, existingLegs);
    } else {
      singleLegTrades.push(trade);
    }
  }

  const effectiveTrades: EffectiveTrade[] = [];

  for (const [signalId, legs] of multiLegGroups) {
    effectiveTrades.push({
      key: signalId,
      result: aggregateMultiLegResult(legs),
      direction: legs[0]?.direction ?? null,
      legs,
    });
  }

  for (const trade of singleLegTrades) {
    effectiveTrades.push({
      key: trade.id,
      result: resultFromSingleTrade(trade),
      direction: trade.direction ?? null,
      legs: [trade],
    });
  }

  return effectiveTrades;
}

export function applyEffectiveOutcomeCounts(
  counts: { wins: number; losses: number; breakevens: number },
  result: EffectiveTradeOutcome,
): void {
  if (result === 'win') counts.wins += 1;
  else if (result === 'loss') counts.losses += 1;
  else counts.breakevens += 1;
}
