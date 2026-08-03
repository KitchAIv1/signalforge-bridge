/**
 * SPEEDFLOOR paper exit walk (bridge) — HS → giveback → opposing → backstop → max hold.
 * Parity with dashboard walkSpeedfloorPaperExit; never places broker orders.
 */

import type { AlphaOmegaDirection } from '../alphaOmegaStreakTracker.js';
import { advanceSpeedfloorPaperWalk } from './advanceSpeedfloorPaperWalk.js';
import { emptyStreak, firstAtOrAfter } from './speedfloorPaperWalkHelpers.js';
import type { WalkLoopState } from './speedfloorPaperWalkStep.js';
import {
  SPEEDFLOOR_PAPER_MAX_HOLD_HOURS,
  type SpeedfloorPaperCandle,
  type SpeedfloorPaperFire,
  type SpeedfloorPaperWalkResult,
} from './speedfloorPaperWalkTypes.js';

export {
  SPEEDFLOOR_PAPER_MAX_HOLD_HOURS,
  type SpeedfloorPaperCandle,
  type SpeedfloorPaperFire,
  type SpeedfloorPaperWalkResult,
} from './speedfloorPaperWalkTypes.js';
export { signedSpeedfloorPaperPips } from './speedfloorPaperWalkHelpers.js';

export function walkSpeedfloorPaperExit(input: {
  direction: AlphaOmegaDirection;
  entryAt: string;
  entryPrice: number;
  candles: readonly SpeedfloorPaperCandle[];
  firesAfterEntry: readonly SpeedfloorPaperFire[];
  givebackEnabled: boolean;
  nowMs?: number;
}): SpeedfloorPaperWalkResult {
  const nowMs = input.nowMs ?? Date.now();
  const maxHoldMs =
    Date.parse(input.entryAt) + SPEEDFLOOR_PAPER_MAX_HOLD_HOURS * 3_600_000;
  const state: WalkLoopState = {
    candleIdx: firstAtOrAfter(input.candles, input.entryAt),
    fireIdx: 0,
    opposing: 0,
    totalFires: 0,
    peakFav: 0,
    streak: emptyStreak(),
  };

  for (;;) {
    const step = advanceSpeedfloorPaperWalk({
      ...input,
      nowMs,
      maxHoldMs,
      state,
    });
    if (step !== 'continue') return step;
  }
}
