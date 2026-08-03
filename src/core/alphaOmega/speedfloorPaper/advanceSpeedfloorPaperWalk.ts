/** Advance SPEEDFLOOR paper walk by one candle or fire event. */

import { firstAtOrAfter } from './speedfloorPaperWalkHelpers.js';
import {
  closeMaxHold,
  tryCandleExit,
  tryFireExit,
  type WalkLoopState,
} from './speedfloorPaperWalkStep.js';
import type {
  SpeedfloorPaperCandle,
  SpeedfloorPaperFire,
  SpeedfloorPaperWalkResult,
} from './speedfloorPaperWalkTypes.js';
import type { AlphaOmegaDirection } from '../alphaOmegaStreakTracker.js';

export function advanceSpeedfloorPaperWalk(input: {
  direction: AlphaOmegaDirection;
  entryAt: string;
  entryPrice: number;
  candles: readonly SpeedfloorPaperCandle[];
  firesAfterEntry: readonly SpeedfloorPaperFire[];
  givebackEnabled: boolean;
  nowMs: number;
  maxHoldMs: number;
  state: WalkLoopState;
}): SpeedfloorPaperWalkResult | 'continue' {
  const nextFireMs = nextEventMs(
    input.state.fireIdx,
    input.firesAfterEntry,
    (fire) => fire.firedAt,
  );
  const nextCandleMs = nextEventMs(
    input.state.candleIdx,
    input.candles,
    (bar) => bar.time,
  );
  if (nextFireMs === Infinity && nextCandleMs === Infinity) {
    return endOfEvents(input);
  }
  if (Math.min(nextFireMs, nextCandleMs) > input.maxHoldMs) {
    return closeMaxHold(
      input.entryPrice,
      input.candles,
      input.maxHoldMs,
      firstAtOrAfter,
    );
  }
  if (nextCandleMs <= nextFireMs) return stepCandle(input);
  return stepFire(input);
}

function nextEventMs<T>(
  idx: number,
  rows: readonly T[],
  timeOf: (row: T) => string,
): number {
  return idx < rows.length ? Date.parse(timeOf(rows[idx]!)) : Infinity;
}

function endOfEvents(input: {
  entryAt: string;
  entryPrice: number;
  candles: readonly SpeedfloorPaperCandle[];
  nowMs: number;
  maxHoldMs: number;
}): SpeedfloorPaperWalkResult {
  if (input.nowMs >= input.maxHoldMs) {
    return closeMaxHold(
      input.entryPrice,
      input.candles,
      input.maxHoldMs,
      firstAtOrAfter,
    );
  }
  return {
    open: true,
    trigger: 'open',
    exitAt: input.entryAt,
    exitPrice: input.entryPrice,
  };
}

function stepCandle(input: {
  direction: AlphaOmegaDirection;
  entryPrice: number;
  candles: readonly SpeedfloorPaperCandle[];
  givebackEnabled: boolean;
  state: WalkLoopState;
}): SpeedfloorPaperWalkResult | 'continue' {
  const bar = input.candles[input.state.candleIdx]!;
  const candleResult = tryCandleExit({
    direction: input.direction,
    entryPrice: input.entryPrice,
    bar,
    peakFav: input.state.peakFav,
    givebackEnabled: input.givebackEnabled,
  });
  if ('trigger' in candleResult) return candleResult;
  input.state.peakFav = candleResult.peakFav;
  input.state.candleIdx += 1;
  return 'continue';
}

function stepFire(input: {
  direction: AlphaOmegaDirection;
  entryPrice: number;
  firesAfterEntry: readonly SpeedfloorPaperFire[];
  state: WalkLoopState;
}): SpeedfloorPaperWalkResult | 'continue' {
  const fire = input.firesAfterEntry[input.state.fireIdx]!;
  const fireResult = tryFireExit({
    direction: input.direction,
    entryPrice: input.entryPrice,
    fire,
    streak: input.state.streak,
    opposing: input.state.opposing,
    totalFires: input.state.totalFires,
  });
  if ('trigger' in fireResult) return fireResult;
  input.state.streak = fireResult.streak;
  input.state.opposing = fireResult.opposing;
  input.state.totalFires = fireResult.totalFires;
  input.state.fireIdx += 1;
  return 'continue';
}
