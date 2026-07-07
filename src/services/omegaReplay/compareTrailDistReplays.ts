/** Aggregate sequenced replay results across trail-distance presets. */

import type { ReplayConfig, ReplayTradeRow } from './types.js';

export interface TrailDistResult {
  trailDistR: number;
  exitModel: NonNullable<ReplayConfig['exitModel']>;
  executedCount: number;
  sequenceBlocked: number;
  executedNetPips: number;
  winRate: number;
  exitMix: Record<string, number>;
  avgNetPips: number;
  maxHoldCount: number;
  rows: ReplayTradeRow[];
  config: ReplayConfig;
}

export function trailDistResultFromRows(
  trailDistR: number,
  exitModel: NonNullable<ReplayConfig['exitModel']>,
  rows: ReplayTradeRow[],
  config: ReplayConfig,
): TrailDistResult {
  const executed = rows.filter((row) => row.gateStatus === 'executed');
  const blocked = rows.filter((row) => row.gateStatus === 'blocked_sequence');
  const netPips = executed.reduce((sum, row) => sum + (row.netPips ?? 0), 0);
  const wins = executed.filter((row) => (row.netPips ?? 0) > 0).length;
  const exitMix: Record<string, number> = {};
  for (const row of executed) {
    const key = row.exitReason ?? 'unknown';
    exitMix[key] = (exitMix[key] ?? 0) + 1;
  }

  return {
    trailDistR,
    exitModel,
    executedCount: executed.length,
    sequenceBlocked: blocked.length,
    executedNetPips: Math.round(netPips * 10) / 10,
    winRate: executed.length ? Math.round((wins / executed.length) * 1000) / 10 : 0,
    exitMix,
    avgNetPips: executed.length ? Math.round((netPips / executed.length) * 100) / 100 : 0,
    maxHoldCount: exitMix.max_hold ?? 0,
    rows,
    config,
  };
}

export interface TrailDistComparison {
  sinceIso: string;
  baselineTrailR: number;
  results: TrailDistResult[];
}

export function rankTrailDistResults(results: TrailDistResult[]): TrailDistResult[] {
  return [...results].sort((left, right) => right.executedNetPips - left.executedNetPips);
}
