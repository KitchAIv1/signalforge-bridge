import type { RebuildShadowSignalRow } from '@/lib/types';
import { rebuildSignalTime } from '@/lib/rebuildShadowAggregates';

export const ACCOUNT_SIZE = 1000;
export const RISK_PCT = 0.01;
export const TP_LEVEL_R = 1.5;
export const SL_LEVEL_R = 1.0;

export interface CompoundedPnLResult {
  resolved: RebuildShadowSignalRow[];
  runningBalance: number;
  totalPnlDollars: number;
  avgPnlDollars: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: string;
  totalReturn: number;
  currentRiskDollars: number;
  currentTpDollars: number;
  currentSlDollars: number;
  equityCurve: { time: string; balance: number }[];
}

function getResolvedSorted(signals: RebuildShadowSignalRow[]): RebuildShadowSignalRow[] {
  return signals
    .filter((s) => s.resolved_at != null && s.pnl_r != null)
    .sort(
      (a, b) =>
        new Date(rebuildSignalTime(a)).getTime() - new Date(rebuildSignalTime(b)).getTime()
    );
}

function bumpOutcomeTally(
  tradePnl: number,
  tallies: { wins: number; losses: number; breakevens: number }
): void {
  if (tradePnl > 0) tallies.wins += 1;
  else if (tradePnl < 0) tallies.losses += 1;
  else tallies.breakevens += 1;
}

export function computeCompoundedStats(signals: RebuildShadowSignalRow[]): CompoundedPnLResult {
  const resolved = getResolvedSorted(signals);
  let runningBalance = ACCOUNT_SIZE;
  let totalPnlDollars = 0;
  const tallies = { wins: 0, losses: 0, breakevens: 0 };
  const equityCurve: { time: string; balance: number }[] = [
    { time: 'Start', balance: ACCOUNT_SIZE },
  ];

  for (const s of resolved) {
    const riskDollars = runningBalance * RISK_PCT;
    const tradePnl = (s.pnl_r ?? 0) * riskDollars;
    runningBalance += tradePnl;
    totalPnlDollars += tradePnl;
    bumpOutcomeTally(tradePnl, tallies);
    equityCurve.push({ time: rebuildSignalTime(s), balance: runningBalance });
  }

  const n = resolved.length;
  const avgPnlDollars = n > 0 ? totalPnlDollars / n : 0;
  const winRate = n > 0 ? ((tallies.wins / n) * 100).toFixed(1) : '0.0';
  const totalReturn = ((runningBalance - ACCOUNT_SIZE) / ACCOUNT_SIZE) * 100;
  const currentRiskDollars = runningBalance * RISK_PCT;

  return {
    resolved,
    runningBalance,
    totalPnlDollars,
    avgPnlDollars,
    wins: tallies.wins,
    losses: tallies.losses,
    breakevens: tallies.breakevens,
    winRate,
    totalReturn,
    currentRiskDollars,
    currentTpDollars: currentRiskDollars * TP_LEVEL_R,
    currentSlDollars: currentRiskDollars * SL_LEVEL_R,
    equityCurve,
  };
}
