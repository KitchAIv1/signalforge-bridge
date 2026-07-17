/**
 * Aggregate ALPHAOMEGA scoreboard metrics from Lane B trade-log rows.
 */

import type { BridgeTradeLogRow } from '@/lib/types';
import { isPhase2ShadowFlagged } from '@/lib/phase2LaneAdvisoryFormat';

export interface AlphaOmegaScoreboardMetrics {
  todayNetPips: number;
  todayNetDollars: number;
  weekNetPips: number;
  weekNetDollars: number;
  closedCount: number;
  winCount: number;
  lossCount: number;
  winRatePct: number | null;
  avgWinPips: number | null;
  avgLossPips: number | null;
  entriesTaken: number;
  speedFloorShadows: number;
  exitOpposing: number;
  exitHardStop: number;
  exitBackstop: number;
  exitGivebackTrail: number;
  exitOther: number;
}

type ExitKind = 'opposing' | 'hard_stop' | 'backstop' | 'giveback_trail' | 'other';
type PipBucket = { sum: number; n: number };

function startOfUtcDayMs(nowMs: number): number {
  const date = new Date(nowMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function classifyExit(closeReason: string | null): ExitKind {
  if (
    closeReason === 'alphaomega_opposing_count' ||
    closeReason === 'alphaomega_opposing_share'
  ) {
    return 'opposing';
  }
  if (closeReason === 'alphaomega_hard_stop') return 'hard_stop';
  if (closeReason === 'alphaomega_backstop_crack') return 'backstop';
  if (closeReason === 'alphaomega_peak_giveback_trail') return 'giveback_trail';
  return 'other';
}

function emptyMetrics(): AlphaOmegaScoreboardMetrics {
  return {
    todayNetPips: 0,
    todayNetDollars: 0,
    weekNetPips: 0,
    weekNetDollars: 0,
    closedCount: 0,
    winCount: 0,
    lossCount: 0,
    winRatePct: null,
    avgWinPips: null,
    avgLossPips: null,
    entriesTaken: 0,
    speedFloorShadows: 0,
    exitOpposing: 0,
    exitHardStop: 0,
    exitBackstop: 0,
    exitGivebackTrail: 0,
    exitOther: 0,
  };
}

function addExitCount(metrics: AlphaOmegaScoreboardMetrics, exitKind: ExitKind): void {
  if (exitKind === 'opposing') metrics.exitOpposing += 1;
  else if (exitKind === 'hard_stop') metrics.exitHardStop += 1;
  else if (exitKind === 'backstop') metrics.exitBackstop += 1;
  else if (exitKind === 'giveback_trail') metrics.exitGivebackTrail += 1;
  else metrics.exitOther += 1;
}

function addWinLoss(
  metrics: AlphaOmegaScoreboardMetrics,
  row: BridgeTradeLogRow,
  pips: number,
  winPips: PipBucket,
  lossPips: PipBucket,
): void {
  if (row.result === 'win' || pips > 0) {
    metrics.winCount += 1;
    if (row.pnl_pips != null) {
      winPips.sum += pips;
      winPips.n += 1;
    }
    return;
  }
  if (row.result === 'loss' || pips < 0) {
    metrics.lossCount += 1;
    if (row.pnl_pips != null) {
      lossPips.sum += pips;
      lossPips.n += 1;
    }
  }
}

function accumulateClosedTrade(
  metrics: AlphaOmegaScoreboardMetrics,
  row: BridgeTradeLogRow,
  todayStart: number,
  weekStart: number,
  winPips: PipBucket,
  lossPips: PipBucket,
): void {
  if (row.decision !== 'EXECUTED' || row.status !== 'closed') return;
  metrics.closedCount += 1;
  const createdMs = new Date(row.created_at).getTime();
  const pips = row.pnl_pips != null ? Number(row.pnl_pips) : 0;
  const dollars = row.pnl_dollars != null ? Number(row.pnl_dollars) : 0;
  if (createdMs >= weekStart) {
    metrics.weekNetPips += pips;
    metrics.weekNetDollars += dollars;
  }
  if (createdMs >= todayStart) {
    metrics.todayNetPips += pips;
    metrics.todayNetDollars += dollars;
  }
  addWinLoss(metrics, row, pips, winPips, lossPips);
  addExitCount(metrics, classifyExit(row.close_reason));
}

export function computeAlphaOmegaScoreboard(
  tradeRows: BridgeTradeLogRow[],
  nowMs: number = Date.now(),
): AlphaOmegaScoreboardMetrics {
  const metrics = emptyMetrics();
  const todayStart = startOfUtcDayMs(nowMs);
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;
  const winPips: PipBucket = { sum: 0, n: 0 };
  const lossPips: PipBucket = { sum: 0, n: 0 };

  for (const row of tradeRows) {
    if (row.decision === 'EXECUTED') metrics.entriesTaken += 1;
    if (isPhase2ShadowFlagged(row)) metrics.speedFloorShadows += 1;
    accumulateClosedTrade(metrics, row, todayStart, weekStart, winPips, lossPips);
  }

  metrics.winRatePct =
    metrics.closedCount > 0 ? (metrics.winCount / metrics.closedCount) * 100 : null;
  metrics.avgWinPips = winPips.n > 0 ? winPips.sum / winPips.n : null;
  metrics.avgLossPips = lossPips.n > 0 ? lossPips.sum / lossPips.n : null;
  return metrics;
}
