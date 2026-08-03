/** One event step for SPEEDFLOOR paper walk (candle or fire). */

import {
  HARD_STOP_PIPS,
  OPPOSING_FIRE_COUNT_THRESHOLD,
  OPPOSING_SHARE_MIN_FIRES,
  OPPOSING_SHARE_THRESHOLD,
} from '../alphaOmegaConstants.js';
import type { AlphaOmegaDirection } from '../alphaOmegaStreakTracker.js';
import {
  adversePips,
  applyBackstop,
  hsExit,
  stepGiveback,
  type PaperStreak,
} from './speedfloorPaperWalkHelpers.js';
import type {
  SpeedfloorPaperCandle,
  SpeedfloorPaperFire,
  SpeedfloorPaperWalkResult,
} from './speedfloorPaperWalkTypes.js';

export interface WalkLoopState {
  candleIdx: number;
  fireIdx: number;
  opposing: number;
  totalFires: number;
  peakFav: number;
  streak: PaperStreak;
}

export function closeMaxHold(
  entry: number,
  candles: readonly SpeedfloorPaperCandle[],
  deadlineMs: number,
  firstAtOrAfter: (c: readonly SpeedfloorPaperCandle[], iso: string) => number,
): SpeedfloorPaperWalkResult {
  const idx = firstAtOrAfter(candles, new Date(deadlineMs).toISOString());
  const bar = idx > 0 ? candles[idx - 1] : candles[0];
  return {
    open: false,
    trigger: 'max_hold',
    exitAt: new Date(deadlineMs).toISOString(),
    exitPrice: bar?.c ?? entry,
  };
}

export function tryCandleExit(input: {
  direction: AlphaOmegaDirection;
  entryPrice: number;
  bar: SpeedfloorPaperCandle;
  peakFav: number;
  givebackEnabled: boolean;
}): SpeedfloorPaperWalkResult | { peakFav: number } {
  if (adversePips(input.direction, input.entryPrice, input.bar) >= HARD_STOP_PIPS) {
    return {
      open: false,
      trigger: 'hard_stop',
      exitAt: input.bar.time,
      exitPrice: hsExit(input.direction, input.entryPrice),
    };
  }
  if (!input.givebackEnabled) return { peakFav: input.peakFav };
  const gb = stepGiveback(
    input.direction,
    input.entryPrice,
    input.peakFav,
    input.bar,
  );
  if (gb.shouldExit) {
    return {
      open: false,
      trigger: 'giveback_trail',
      exitAt: input.bar.time,
      exitPrice: input.bar.c,
    };
  }
  return { peakFav: gb.nextPeak };
}

export function tryFireExit(input: {
  direction: AlphaOmegaDirection;
  entryPrice: number;
  fire: SpeedfloorPaperFire;
  streak: PaperStreak;
  opposing: number;
  totalFires: number;
}):
  | SpeedfloorPaperWalkResult
  | { streak: PaperStreak; opposing: number; totalFires: number } {
  const { next, backstop } = applyBackstop(input.streak, input.fire, input.direction);
  if (backstop) {
    return {
      open: false,
      trigger: 'backstop_crack',
      exitAt: input.fire.firedAt,
      exitPrice: input.fire.markPrice ?? input.entryPrice,
    };
  }
  const totalFires = input.totalFires + 1;
  const opposing =
    input.fire.direction !== input.direction ? input.opposing + 1 : input.opposing;
  if (opposing >= OPPOSING_FIRE_COUNT_THRESHOLD) {
    return {
      open: false,
      trigger: 'opposing_count',
      exitAt: input.fire.firedAt,
      exitPrice: input.fire.markPrice ?? input.entryPrice,
    };
  }
  if (
    totalFires >= OPPOSING_SHARE_MIN_FIRES &&
    opposing / totalFires >= OPPOSING_SHARE_THRESHOLD
  ) {
    return {
      open: false,
      trigger: 'opposing_share',
      exitAt: input.fire.firedAt,
      exitPrice: input.fire.markPrice ?? input.entryPrice,
    };
  }
  return { streak: next, opposing, totalFires };
}
