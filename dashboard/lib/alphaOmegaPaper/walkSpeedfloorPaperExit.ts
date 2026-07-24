/**
 * Read-only SPEEDFLOOR paper exit walk: HS → giveback → opposing → backstop → max hold.
 * Never places or closes live trades.
 */

import { PAPER_HARD_STOP_PIPS, PAPER_MAX_HOLD_HOURS } from './paperSimConstants';
import { evaluatePaperGiveback } from './evaluatePaperGiveback';
import {
  adversePips,
  firstCandleAtOrAfter,
  hardStopExitPrice,
  signedPips,
} from './paperPathMath';
import { emptyPaperStreak, tryPaperFireExits } from './tryPaperFireExits';
import type { PaperCandle, PaperExitTrigger, PaperFire } from './paperSimTypes';

export interface PaperWalkResult {
  exitAt: string;
  exitPrice: number;
  trigger: PaperExitTrigger;
  open: boolean;
}

export function walkSpeedfloorPaperExit(input: {
  direction: 'LONG' | 'SHORT';
  entryAt: string;
  entryPrice: number;
  candles: readonly PaperCandle[];
  firesAfterEntry: readonly PaperFire[];
  givebackEnabled: boolean;
  nowMs?: number;
}): PaperWalkResult {
  const nowMs = input.nowMs ?? Date.now();
  const maxHoldMs = Date.parse(input.entryAt) + PAPER_MAX_HOLD_HOURS * 3_600_000;
  const state = {
    candleIdx: firstCandleAtOrAfter(input.candles, input.entryAt),
    fireIdx: 0,
    opposing: 0,
    totalFires: 0,
    peakFav: 0,
    streak: emptyPaperStreak(),
  };

  while (true) {
    const step = advancePaperStep(input, state, maxHoldMs, nowMs);
    if (step) return step;
  }
}

function advancePaperStep(
  input: {
    direction: 'LONG' | 'SHORT';
    entryAt: string;
    entryPrice: number;
    candles: readonly PaperCandle[];
    firesAfterEntry: readonly PaperFire[];
    givebackEnabled: boolean;
  },
  state: {
    candleIdx: number;
    fireIdx: number;
    opposing: number;
    totalFires: number;
    peakFav: number;
    streak: ReturnType<typeof emptyPaperStreak>;
  },
  maxHoldMs: number,
  nowMs: number,
): PaperWalkResult | null {
  const nextFireMs =
    state.fireIdx < input.firesAfterEntry.length
      ? Date.parse(input.firesAfterEntry[state.fireIdx]!.firedAt)
      : Infinity;
  const nextCandleMs =
    state.candleIdx < input.candles.length
      ? Date.parse(input.candles[state.candleIdx]!.time)
      : Infinity;

  if (nextFireMs === Infinity && nextCandleMs === Infinity) {
    return openOrMaxHold(input.entryAt, input.entryPrice, input.candles, maxHoldMs, nowMs);
  }
  if (Math.min(nextFireMs, nextCandleMs) > maxHoldMs) {
    return closeMaxHold(input.entryPrice, input.candles, maxHoldMs);
  }
  if (nextCandleMs <= nextFireMs) {
    return stepCandle(input, state);
  }
  return stepFire(input, state);
}

function stepCandle(
  input: {
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    candles: readonly PaperCandle[];
    givebackEnabled: boolean;
  },
  state: { candleIdx: number; peakFav: number },
): PaperWalkResult | null {
  const bar = input.candles[state.candleIdx]!;
  if (adversePips(input.direction, input.entryPrice, bar) >= PAPER_HARD_STOP_PIPS) {
    return {
      exitAt: bar.time,
      exitPrice: hardStopExitPrice(input.direction, input.entryPrice, PAPER_HARD_STOP_PIPS),
      trigger: 'hard_stop',
      open: false,
    };
  }
  if (input.givebackEnabled) {
    const gb = evaluatePaperGiveback(
      input.direction,
      input.entryPrice,
      state.peakFav,
      bar,
    );
    state.peakFav = gb.nextPeak;
    if (gb.shouldExit) {
      return { exitAt: bar.time, exitPrice: bar.c, trigger: 'giveback_trail', open: false };
    }
  }
  state.candleIdx += 1;
  return null;
}

function stepFire(
  input: {
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    firesAfterEntry: readonly PaperFire[];
  },
  state: {
    fireIdx: number;
    opposing: number;
    totalFires: number;
    streak: ReturnType<typeof emptyPaperStreak>;
  },
): PaperWalkResult | null {
  const fire = input.firesAfterEntry[state.fireIdx]!;
  const outcome = tryPaperFireExits(
    input.direction,
    input.entryPrice,
    fire,
    state.opposing,
    state.totalFires,
    state.streak,
  );
  state.opposing = outcome.opposing;
  state.totalFires = outcome.totalFires;
  state.streak = outcome.streak;
  state.fireIdx += 1;
  if (outcome.trigger && outcome.exitAt != null && outcome.exitPrice != null) {
    return {
      exitAt: outcome.exitAt,
      exitPrice: outcome.exitPrice,
      trigger: outcome.trigger,
      open: false,
    };
  }
  return null;
}

function closeMaxHold(
  entry: number,
  candles: readonly PaperCandle[],
  deadlineMs: number,
): PaperWalkResult {
  const idx = firstCandleAtOrAfter(candles, new Date(deadlineMs).toISOString());
  const bar = idx > 0 ? candles[idx - 1] : candles[0];
  return {
    exitAt: new Date(deadlineMs).toISOString(),
    exitPrice: bar?.c ?? entry,
    trigger: 'max_hold',
    open: false,
  };
}

function openOrMaxHold(
  entryAt: string,
  entry: number,
  candles: readonly PaperCandle[],
  maxHoldMs: number,
  nowMs: number,
): PaperWalkResult {
  if (nowMs >= maxHoldMs) return closeMaxHold(entry, candles, maxHoldMs);
  return { exitAt: entryAt, exitPrice: entry, trigger: 'open', open: true };
}

export function paperPipsFromWalk(
  direction: 'LONG' | 'SHORT',
  entry: number,
  walk: PaperWalkResult,
): number | null {
  if (walk.open) return null;
  return signedPips(direction, entry, walk.exitPrice);
}
