/** Sequenced replay with flip cooldown + progress time-stop exits. */

import { OMEGA_EXEC_COST_PIPS, OMEGA_PIP_SIZE } from './liveTrailConstants.js';
import { evaluateReplayEntryGate } from './applyEntryGates.js';
import { directionRelation, slotFromExecutedRow, type ActiveReplaySlot } from './activeReplaySlot.js';
import { simulateProgressTimeStopExit } from './progressTimeStopExit.js';
import type {
  LiveFillRecord,
  ReplayConfig,
  ReplaySignalInput,
  ReplayTradeRow,
} from './types.js';

export interface CounterfactualReplayOptions {
  flipCooldownMin?: number;
  progressDeadlineMin?: number;
  progressMinR?: number;
}

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
  return { entryPrice: signal.signalEntry, structureStop: signal.signalStopLoss };
}

function simulateExit(
  signal: ReplaySignalInput,
  pricing: { entryPrice: number; structureStop: number },
  config: ReplayConfig,
  counterfactual: CounterfactualReplayOptions,
) {
  return simulateProgressTimeStopExit({
    direction: signal.direction,
    entryPrice: pricing.entryPrice,
    structureStop: pricing.structureStop,
    entryTimeMs: Date.parse(signal.firedAtIso),
    bars: signal.bars,
    maxHoldMinutes: config.maxHoldMinutes,
    executionCostPips: config.executionCostPips,
    trailDistR: config.trailDistR,
    progressDeadlineMin: counterfactual.progressDeadlineMin,
    progressMinR: counterfactual.progressMinR,
  });
}

function buildBlockedRow(
  signal: ReplaySignalInput,
  gateStatus: ReplayTradeRow['gateStatus'],
  gateReason: string | null,
  sessionWindow: ReplayTradeRow['sessionWindow'],
  liveFill: LiveFillRecord | undefined,
  config: ReplayConfig,
  counterfactual: CounterfactualReplayOptions,
  activeSlot: ActiveReplaySlot | null,
): ReplayTradeRow {
  const pricing = resolveEntryPricing(signal, liveFill);
  const rPips = Math.abs(pricing.entryPrice - pricing.structureStop) / OMEGA_PIP_SIZE;
  const shadowExit = simulateExit(signal, pricing, config, counterfactual);

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
  counterfactual: CounterfactualReplayOptions,
): ReplayTradeRow {
  const pricing = resolveEntryPricing(signal, liveFill);
  const exit = simulateExit(signal, pricing, config, counterfactual);
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

function isFlipCooldownBlock(
  signal: ReplaySignalInput,
  firedMs: number,
  lastClosedDirection: ReplaySignalInput['direction'] | null,
  lastClosedAtMs: number,
  flipCooldownMin: number | undefined,
): boolean {
  if (flipCooldownMin == null || lastClosedDirection == null || lastClosedAtMs <= 0) return false;
  if (signal.direction === lastClosedDirection) return false;
  return firedMs < lastClosedAtMs + flipCooldownMin * 60_000;
}

export function runCounterfactualReplay(
  signals: ReplaySignalInput[],
  liveFillBySignal: Map<string, LiveFillRecord>,
  config: ReplayConfig,
  counterfactual: CounterfactualReplayOptions,
  resolveLiveFill?: (signal: ReplaySignalInput) => LiveFillRecord | undefined,
): ReplayTradeRow[] {
  const sorted = [...signals].sort(
    (left, right) => Date.parse(left.firedAtIso) - Date.parse(right.firedAtIso),
  );

  let openUntilMs = 0;
  let activeSlot: ActiveReplaySlot | null = null;
  let lastClosedDirection: ReplaySignalInput['direction'] | null = null;
  let lastClosedAtMs = 0;
  const rows: ReplayTradeRow[] = [];

  for (const signal of sorted) {
    const firedMs = Date.parse(signal.firedAtIso);
    const liveFill = resolveLiveFill
      ? resolveLiveFill(signal)
      : liveFillBySignal.get(signal.signalId);
    const gate = evaluateReplayEntryGate(signal.firedAtIso, signal.direction, config);

    if (gate.gateStatus === 'blocked_gate') {
      rows.push(
        buildBlockedRow(signal, 'blocked_gate', gate.gateReason, gate.sessionWindow, liveFill, config, counterfactual, null),
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
          counterfactual,
          activeSlot,
        ),
      );
      continue;
    }

    if (isFlipCooldownBlock(signal, firedMs, lastClosedDirection, lastClosedAtMs, counterfactual.flipCooldownMin)) {
      rows.push(
        buildBlockedRow(
          signal,
          'blocked_sequence',
          'flip_cooldown_90m',
          gate.sessionWindow,
          liveFill,
          config,
          counterfactual,
          activeSlot,
        ),
      );
      continue;
    }

    const executed = buildExecutedRow(signal, gate.sessionWindow, liveFill, config, counterfactual);
    rows.push(executed);

    if (executed.holdMinutes != null && executed.exitReason != null && executed.netPips != null) {
      openUntilMs = firedMs + executed.holdMinutes * 60_000;
      lastClosedAtMs = openUntilMs;
      lastClosedDirection = signal.direction;
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

export function summarizeCounterfactualRows(
  rows: ReplayTradeRow[],
  tradeDateUtc: string,
): { executed: number; wins: number; netPips: number; wr: number } {
  const dayRows = rows.filter(
    (row) => row.gateStatus === 'executed' && row.firedAtIso.slice(0, 10) === tradeDateUtc,
  );
  const netPips = dayRows.reduce((sum, row) => sum + (row.netPips ?? 0), 0);
  const wins = dayRows.filter((row) => (row.netPips ?? 0) > 0).length;
  return {
    executed: dayRows.length,
    wins,
    netPips: Math.round(netPips * 10) / 10,
    wr: dayRows.length ? Math.round((wins / dayRows.length) * 1000) / 10 : 0,
  };
}

export { OMEGA_EXEC_COST_PIPS };
