/** Chronological one-trade-at-a-time OMEGA replay loop. */

import { OMEGA_EXEC_COST_PIPS, OMEGA_PIP_SIZE } from './liveTrailConstants.js';
import { directionRelation, slotFromExecutedRow, type ActiveReplaySlot } from './activeReplaySlot.js';
import { evaluateReplayEntryGate } from './applyEntryGates.js';
import { simulateOmegaTrailExit } from './trailExitEngine.js';
import type {
  LiveFillRecord,
  ReplayConfig,
  ReplaySignalInput,
  ReplaySummary,
  ReplayTradeRow,
} from './types.js';

function hourUtc(iso: string): number {
  return new Date(iso).getUTCHours();
}

function resolveEntryPricing(
  signal: ReplaySignalInput,
  liveFill: LiveFillRecord | undefined,
): { entryPrice: number; structureStop: number } {
  if (liveFill) {
    return { entryPrice: liveFill.fillPrice, structureStop: liveFill.structureStop };
  }
  return {
    entryPrice: signal.signalEntry,
    structureStop: signal.signalStopLoss,
  };
}

function buildBlockedRow(
  signal: ReplaySignalInput,
  gateStatus: ReplayTradeRow['gateStatus'],
  gateReason: string | null,
  sessionWindow: ReplayTradeRow['sessionWindow'],
  liveFill: LiveFillRecord | undefined,
  config: ReplayConfig,
  activeSlot: ActiveReplaySlot | null,
): ReplayTradeRow {
  const pricing = resolveEntryPricing(signal, liveFill);
  const rPips = Math.abs(pricing.entryPrice - pricing.structureStop) / OMEGA_PIP_SIZE;
  const entryTimeMs = Date.parse(signal.firedAtIso);
  const shadowExit = simulateOmegaTrailExit({
    direction: signal.direction,
    entryPrice: pricing.entryPrice,
    structureStop: pricing.structureStop,
    entryTimeMs,
    bars: signal.bars,
    maxHoldMinutes: config.maxHoldMinutes,
    executionCostPips: config.executionCostPips,
  });

  return {
    signalId: signal.signalId,
    firedAtIso: signal.firedAtIso,
    hourUtc: hourUtc(signal.firedAtIso),
    direction: signal.direction,
    sessionWindow,
    gateStatus,
    gateReason,
    entryPrice: pricing.entryPrice,
    structureStop: pricing.structureStop,
    rPips: Math.round(rPips * 10) / 10,
    exitReason: null,
    holdMinutes: null,
    grossPips: null,
    netPips: null,
    exitBarIndex: null,
    livePnlPips: liveFill?.livePnlPips ?? null,
    liveCloseReason: liveFill?.liveCloseReason ?? null,
    liveDurationMin: liveFill?.liveDurationMin ?? null,
    deltaSimVsLive: null,
    blockerSignalId: activeSlot?.signalId ?? null,
    blockerDirection: activeSlot?.direction ?? null,
    blockerExitReason: activeSlot?.exitReason ?? null,
    blockerHoldMinutes: activeSlot?.holdMinutes ?? null,
    blockerNetPips: activeSlot?.netPips ?? null,
    directionVsBlocker:
      activeSlot != null ? directionRelation(signal.direction, activeSlot.direction) : null,
    shadowNetPipsIfExecuted: Math.round(shadowExit.netPips * 10) / 10,
  };
}

function buildExecutedRow(
  signal: ReplaySignalInput,
  sessionWindow: ReplayTradeRow['sessionWindow'],
  liveFill: LiveFillRecord | undefined,
  config: ReplayConfig,
): ReplayTradeRow {
  const pricing = resolveEntryPricing(signal, liveFill);
  const entryTimeMs = Date.parse(signal.firedAtIso);
  const exit = simulateOmegaTrailExit({
    direction: signal.direction,
    entryPrice: pricing.entryPrice,
    structureStop: pricing.structureStop,
    entryTimeMs,
    bars: signal.bars,
    maxHoldMinutes: config.maxHoldMinutes,
    executionCostPips: config.executionCostPips,
  });

  const livePips = liveFill?.livePnlPips ?? null;
  return {
    signalId: signal.signalId,
    firedAtIso: signal.firedAtIso,
    hourUtc: hourUtc(signal.firedAtIso),
    direction: signal.direction,
    sessionWindow,
    gateStatus: 'executed',
    gateReason: null,
    entryPrice: pricing.entryPrice,
    structureStop: pricing.structureStop,
    rPips: Math.round(Math.abs(pricing.entryPrice - pricing.structureStop) / OMEGA_PIP_SIZE * 10) / 10,
    exitReason: exit.exitReason,
    holdMinutes: exit.holdMinutes,
    grossPips: Math.round(exit.grossPips * 10) / 10,
    netPips: Math.round(exit.netPips * 10) / 10,
    exitBarIndex: exit.exitBarIndex,
    livePnlPips: livePips,
    liveCloseReason: liveFill?.liveCloseReason ?? null,
    liveDurationMin: liveFill?.liveDurationMin ?? null,
    deltaSimVsLive: livePips != null ? Math.round((exit.netPips - livePips) * 10) / 10 : null,
  };
}

export function runSequencedReplay(
  signals: ReplaySignalInput[],
  liveFillBySignal: Map<string, LiveFillRecord>,
  config: ReplayConfig,
  resolveLiveFill?: (signal: ReplaySignalInput) => LiveFillRecord | undefined,
): ReplayTradeRow[] {
  const sorted = [...signals].sort(
    (left, right) => Date.parse(left.firedAtIso) - Date.parse(right.firedAtIso),
  );

  let openUntilMs = 0;
  let activeSlot: ActiveReplaySlot | null = null;
  const rows: ReplayTradeRow[] = [];

  for (const signal of sorted) {
    const firedMs = Date.parse(signal.firedAtIso);
    const liveFill = resolveLiveFill
      ? resolveLiveFill(signal)
      : liveFillBySignal.get(signal.signalId);
    const gate = evaluateReplayEntryGate(signal.firedAtIso, signal.direction, config);

    if (gate.gateStatus === 'blocked_gate') {
      rows.push(
        buildBlockedRow(signal, 'blocked_gate', gate.gateReason, gate.sessionWindow, liveFill, config, null),
      );
      continue;
    }

    if (firedMs < openUntilMs) {
      rows.push(
        buildBlockedRow(
          signal,
          'blocked_sequence',
          'prior_trade_open',
          gate.sessionWindow,
          liveFill,
          config,
          activeSlot,
        ),
      );
      continue;
    }

    const executed = buildExecutedRow(signal, gate.sessionWindow, liveFill, config);
    rows.push(executed);

    if (executed.holdMinutes != null && executed.exitReason != null && executed.netPips != null) {
      openUntilMs = firedMs + executed.holdMinutes * 60_000;
      activeSlot = slotFromExecutedRow(
        signal.signalId,
        signal.direction,
        firedMs,
        executed.holdMinutes,
        executed.exitReason,
        executed.netPips,
      );
    }
  }

  return rows;
}

export function summarizeReplay(
  rows: ReplayTradeRow[],
  sinceIso: string,
  config: ReplayConfig,
): ReplaySummary {
  const executed = rows.filter((row) => row.gateStatus === 'executed');
  const simPips = executed.map((row) => row.netPips ?? 0);
  const simWins = simPips.filter((pips) => pips > 0).length;
  const liveRows = executed.filter((row) => row.livePnlPips != null);
  const livePips = liveRows.map((row) => row.livePnlPips ?? 0);
  const deltas = liveRows
    .map((row) => row.deltaSimVsLive)
    .filter((delta): delta is number => delta != null);

  return {
    sinceIso,
    rawMode: config.rawMode,
    maxHoldMinutes: config.maxHoldMinutes,
    totalSignals: rows.length,
    gateBlocked: rows.filter((row) => row.gateStatus === 'blocked_gate').length,
    sequenceBlocked: rows.filter((row) => row.gateStatus === 'blocked_sequence').length,
    executed: executed.length,
    insufficientBars: executed.filter((row) => row.exitReason === 'insufficient_bars').length,
    simTotalNetPips: Math.round(simPips.reduce((sum, pips) => sum + pips, 0) * 10) / 10,
    simWinRate: executed.length ? Math.round((simWins / executed.length) * 1000) / 10 : 0,
    liveMatched: liveRows.length,
    liveTotalNetPips: Math.round(livePips.reduce((sum, pips) => sum + pips, 0) * 10) / 10,
    liveWinRate: liveRows.length
      ? Math.round((livePips.filter((pips) => pips > 0).length / liveRows.length) * 1000) / 10
      : 0,
    meanAbsDeltaPips: deltas.length
      ? Math.round(deltas.reduce((sum, delta) => sum + Math.abs(delta), 0) / deltas.length * 10) / 10
      : 0,
  };
}

export function defaultReplayConfig(
  overrides: Partial<ReplayConfig> = {},
): ReplayConfig {
  return {
    rawMode: true,
    maxHoldMinutes: 180,
    executionCostPips: OMEGA_EXEC_COST_PIPS,
    omegaDirectionByDate: new Map(),
    ...overrides,
  };
}

