/** Compare sequenced replays across max-hold caps — freed-trade analysis. */

import type { ReplayConfig, ReplayTradeRow } from './types.js';

export interface CapReplayResult {
  capMinutes: number;
  capLabel: string;
  rows: ReplayTradeRow[];
  executedNetPips: number;
  executedCount: number;
  sequenceBlockedCount: number;
}

export interface FreedTradeRow {
  capLabel: string;
  capMinutes: number;
  signalId: string;
  firedAtIso: string;
  direction: ReplayTradeRow['direction'];
  netPips: number;
  exitReason: ReplayTradeRow['exitReason'];
  holdMinutes: number;
  blockerSignalId: string | null;
  blockerDirection: ReplayTradeRow['direction'] | null;
  blockerExitReasonBaseline: ReplayTradeRow['exitReason'] | null;
  blockerHoldBaseline: number | null;
  blockerExitReasonAtCap: ReplayTradeRow['exitReason'] | null;
  blockerHoldAtCap: number | null;
  directionVsBlocker: 'same' | 'opposite' | null;
  blockerWasMaxHoldAtBaseline: boolean;
  shadowNetPipsAtBaseline: number | null;
}

export interface CapCompareSummary {
  baselineCapMinutes: number;
  baselineNetPips: number;
  baselineExecuted: number;
  baselineSequenceBlocked: number;
  capRows: CapReplayResult[];
  freedByCap: FreedTradeRow[];
  pnlDeltaVsBaseline: Record<string, number>;
  freedPipsByCap: Record<string, number>;
  overlapPipsDeltaByCap: Record<string, number>;
}

function sumExecutedPips(rows: ReplayTradeRow[]): number {
  return rows
    .filter((row) => row.gateStatus === 'executed')
    .reduce((sum, row) => sum + (row.netPips ?? 0), 0);
}

function rowBySignalId(rows: ReplayTradeRow[]): Map<string, ReplayTradeRow> {
  return new Map(rows.map((row) => [row.signalId, row]));
}

function findBlockerAtCap(
  baselineBlockerId: string | null | undefined,
  capRows: ReplayTradeRow[],
): ReplayTradeRow | null {
  if (!baselineBlockerId) return null;
  return capRows.find((row) => row.signalId === baselineBlockerId) ?? null;
}

export function buildFreedTrades(
  baseline: CapReplayResult,
  candidate: CapReplayResult,
): FreedTradeRow[] {
  const baselineMap = rowBySignalId(baseline.rows);
  const candidateMap = rowBySignalId(candidate.rows);
  const freed: FreedTradeRow[] = [];

  for (const [signalId, baseRow] of baselineMap) {
    if (baseRow.gateStatus !== 'blocked_sequence') continue;
    const capRow = candidateMap.get(signalId);
    if (!capRow || capRow.gateStatus !== 'executed') continue;

    const blockerAtCap = findBlockerAtCap(baseRow.blockerSignalId, candidate.rows);
    freed.push({
      capLabel: candidate.capLabel,
      capMinutes: candidate.capMinutes,
      signalId,
      firedAtIso: capRow.firedAtIso,
      direction: capRow.direction,
      netPips: capRow.netPips ?? 0,
      exitReason: capRow.exitReason,
      holdMinutes: capRow.holdMinutes ?? 0,
      blockerSignalId: baseRow.blockerSignalId ?? null,
      blockerDirection: baseRow.blockerDirection ?? null,
      blockerExitReasonBaseline: baseRow.blockerExitReason ?? null,
      blockerHoldBaseline: baseRow.blockerHoldMinutes ?? null,
      blockerExitReasonAtCap: blockerAtCap?.exitReason ?? null,
      blockerHoldAtCap: blockerAtCap?.holdMinutes ?? null,
      directionVsBlocker: baseRow.directionVsBlocker ?? null,
      blockerWasMaxHoldAtBaseline: baseRow.blockerExitReason === 'max_hold',
      shadowNetPipsAtBaseline: baseRow.shadowNetPipsIfExecuted ?? null,
    });
  }

  return freed;
}

export function compareCapReplays(
  baselineCapMinutes: number,
  capResults: CapReplayResult[],
): CapCompareSummary {
  const baseline = capResults.find((result) => result.capMinutes === baselineCapMinutes);
  if (!baseline) throw new Error(`Baseline cap ${baselineCapMinutes} missing`);

  const pnlDeltaVsBaseline: Record<string, number> = {};
  const freedPipsByCap: Record<string, number> = {};
  const overlapPipsDeltaByCap: Record<string, number> = {};
  const freedByCap: FreedTradeRow[] = [];

  const baselineExecutedIds = new Set(
    baseline.rows.filter((row) => row.gateStatus === 'executed').map((row) => row.signalId),
  );

  for (const candidate of capResults) {
    if (candidate.capMinutes === baselineCapMinutes) continue;

    pnlDeltaVsBaseline[candidate.capLabel] =
      Math.round((candidate.executedNetPips - baseline.executedNetPips) * 10) / 10;

    const freed = buildFreedTrades(baseline, candidate);
    freedByCap.push(...freed);
    freedPipsByCap[candidate.capLabel] =
      Math.round(freed.reduce((sum, row) => sum + row.netPips, 0) * 10) / 10;

    let overlapDelta = 0;
    for (const row of candidate.rows) {
      if (row.gateStatus !== 'executed' || !baselineExecutedIds.has(row.signalId)) continue;
      const baseRow = baseline.rows.find((entry) => entry.signalId === row.signalId);
      if (!baseRow || baseRow.gateStatus !== 'executed') continue;
      overlapDelta += (row.netPips ?? 0) - (baseRow.netPips ?? 0);
    }
    overlapPipsDeltaByCap[candidate.capLabel] = Math.round(overlapDelta * 10) / 10;
  }

  return {
    baselineCapMinutes,
    baselineNetPips: baseline.executedNetPips,
    baselineExecuted: baseline.executedCount,
    baselineSequenceBlocked: baseline.sequenceBlockedCount,
    capRows: capResults,
    freedByCap,
    pnlDeltaVsBaseline,
    freedPipsByCap,
    overlapPipsDeltaByCap,
  };
}

export function capResultFromRows(
  capMinutes: number,
  rows: ReplayTradeRow[],
  _config: ReplayConfig,
): CapReplayResult {
  return {
    capMinutes,
    capLabel: `${capMinutes}m`,
    rows,
    executedNetPips: Math.round(sumExecutedPips(rows) * 10) / 10,
    executedCount: rows.filter((row) => row.gateStatus === 'executed').length,
    sequenceBlockedCount: rows.filter((row) => row.gateStatus === 'blocked_sequence').length,
  };
}
