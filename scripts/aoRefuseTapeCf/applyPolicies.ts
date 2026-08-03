/** Apply refuse-tape mesh policies to the live AO book (counterfactual). */

import { signalStopPips } from './parseAdvisory.js';
import {
  buildRefuseTapeContext,
  sessionIsShallowForBrake,
  shouldSkipShallowRefuseEntry,
} from './refuseTapeFeatures.js';
import type {
  LiveAoTradeRow,
  LiveFireRow,
  PolicyTradeResult,
  TradePathMetrics,
} from './types.js';

export interface PolicyFlags {
  label: string;
  normalizeSizeToHardStop10: boolean;
  /** Size cut only on shallow+refuse entries (preserves deep-streak upside). */
  sizeCutShallowRefuseToHardStop10: boolean;
  conditionalBrakeAfter2Losers: boolean;
  skipShallowRefuseEntries: boolean;
  halfSizeShallowRefuseEntries: boolean;
  noFollowThroughAbort: boolean;
}

const HARD_STOP_PIPS = 10;

function dollarsPerPip(trade: LiveAoTradeRow): number {
  if (trade.pnlPips !== 0) return trade.pnlDollars / trade.pnlPips;
  return Math.abs(trade.units) * 0.0001;
}

function sizeMultForHardStop(trade: LiveAoTradeRow, enabled: boolean): number {
  if (!enabled) return 1;
  const stopPips = signalStopPips(trade.fillPrice, trade.stopLoss);
  if (stopPips == null || stopPips <= 0) return 1;
  return Math.min(1, stopPips / HARD_STOP_PIPS);
}

function resolveSizeMult(
  trade: LiveAoTradeRow,
  shallowRefuse: boolean,
  flags: PolicyFlags,
): number {
  let sizeMult = 1;
  if (flags.normalizeSizeToHardStop10) {
    sizeMult = sizeMultForHardStop(trade, true);
  } else if (flags.sizeCutShallowRefuseToHardStop10 && shallowRefuse) {
    sizeMult = sizeMultForHardStop(trade, true);
  }
  if (flags.halfSizeShallowRefuseEntries && shallowRefuse) sizeMult *= 0.5;
  return sizeMult;
}

function resolvePips(
  trade: LiveAoTradeRow,
  path: TradePathMetrics,
  useAbort: boolean,
): { pips: number; abortUsed: boolean } {
  if (useAbort && path.abortTriggered && path.abortPips != null) {
    const abortMs = path.abortAt ? Date.parse(path.abortAt) : Number.POSITIVE_INFINITY;
    const exitMs = Date.parse(trade.closedAt);
    if (abortMs < exitMs) return { pips: path.abortPips, abortUsed: true };
  }
  return { pips: trade.pnlPips, abortUsed: false };
}

export function applyPolicyToLiveBook(
  trades: readonly LiveAoTradeRow[],
  fires: readonly LiveFireRow[],
  paths: ReadonlyMap<string, TradePathMetrics>,
  flags: PolicyFlags,
): PolicyTradeResult[] {
  const results: PolicyTradeResult[] = [];
  const byDay = new Map<string, LiveAoTradeRow[]>();

  for (const trade of trades) {
    const day = trade.createdAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(trade);
  }

  for (const dayTrades of byDay.values()) {
    results.push(...applyPolicyToDay(dayTrades, fires, paths, flags));
  }
  return results;
}

function applyPolicyToDay(
  dayTrades: readonly LiveAoTradeRow[],
  fires: readonly LiveFireRow[],
  paths: ReadonlyMap<string, TradePathMetrics>,
  flags: PolicyFlags,
): PolicyTradeResult[] {
  const ordered = [...dayTrades].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
  );
  const takenGeometry: LiveAoTradeRow[] = [];
  const loserTrades: LiveAoTradeRow[] = [];
  let lastLoserMfePips: number | null = null;
  let paused = false;
  const out: PolicyTradeResult[] = [];

  for (const trade of ordered) {
    const day = trade.createdAt.slice(0, 10);
    const context = buildRefuseTapeContext(fires, trade.entryAt);
    const path = paths.get(trade.id) ?? {
      mfePips: 0,
      maePips: 0,
      abortTriggered: false,
      abortAt: null,
      abortPips: null,
    };

    if (paused) {
      out.push(skippedResult(trade, day, 'session_brake'));
      continue;
    }

    const shallowRefuse = shouldSkipShallowRefuseEntry(trade, context);
    if (flags.skipShallowRefuseEntries && shallowRefuse) {
      out.push(skippedResult(trade, day, 'shallow_refuse_skip'));
      continue;
    }

    const sizeMult = resolveSizeMult(trade, shallowRefuse, flags);

    const resolved = resolvePips(trade, path, flags.noFollowThroughAbort);
    const pipValue = dollarsPerPip(trade);
    const cfDollars = resolved.pips * pipValue * sizeMult;
    takenGeometry.push(trade);
    out.push({
      tradeId: trade.id,
      day,
      taken: true,
      skipReason: null,
      cfPips: resolved.pips,
      cfDollars,
      sizeMult,
      abortUsed: resolved.abortUsed,
      actualPips: trade.pnlPips,
      actualDollars: trade.pnlDollars,
    });

    if (resolved.pips < 0) {
      loserTrades.push(trade);
      lastLoserMfePips = path.mfePips;
    }
    if (
      flags.conditionalBrakeAfter2Losers &&
      sessionIsShallowForBrake({
        takenTrades: takenGeometry,
        loserTrades,
        lastLoserMfePips,
      })
    ) {
      paused = true;
    }
  }
  return out;
}

function skippedResult(
  trade: LiveAoTradeRow,
  day: string,
  reason: string,
): PolicyTradeResult {
  return {
    tradeId: trade.id,
    day,
    taken: false,
    skipReason: reason,
    cfPips: 0,
    cfDollars: 0,
    sizeMult: 0,
    abortUsed: false,
    actualPips: trade.pnlPips,
    actualDollars: trade.pnlDollars,
  };
}
