/** Helpers for SPEEDFLOOR paper exit walk (prices, giveback, backstop streak). */

import {
  ALPHAOMEGA_GIVEBACK_ACTIVATION_PIPS,
  ALPHAOMEGA_GIVEBACK_PIPS,
  ENTRY_SPEED_CEILING_MIN,
  ENTRY_STREAK_LENGTH,
  HARD_STOP_PIPS,
  MAX_INTRA_RUN_GAP_MINUTES,
  PIP_SIZE,
} from '../alphaOmegaConstants.js';
import type { AlphaOmegaDirection } from '../alphaOmegaStreakTracker.js';
import type { SpeedfloorPaperCandle, SpeedfloorPaperFire } from './speedfloorPaperWalkTypes.js';

export interface PaperStreak {
  direction: AlphaOmegaDirection | null;
  length: number;
  startAt: string | null;
  lastAt: string | null;
  armed: boolean;
  armedDirection: AlphaOmegaDirection | null;
}

export function emptyStreak(): PaperStreak {
  return {
    direction: null,
    length: 0,
    startAt: null,
    lastAt: null,
    armed: false,
    armedDirection: null,
  };
}

export function minutesBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 60_000;
}

export function firstAtOrAfter(
  candles: readonly SpeedfloorPaperCandle[],
  iso: string,
): number {
  let lo = 0;
  let hi = candles.length;
  const target = Date.parse(iso);
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Date.parse(candles[mid]!.time) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function adversePips(
  dir: AlphaOmegaDirection,
  entry: number,
  bar: SpeedfloorPaperCandle,
): number {
  return dir === 'LONG' ? (entry - bar.l) / PIP_SIZE : (bar.h - entry) / PIP_SIZE;
}

export function favorablePips(
  dir: AlphaOmegaDirection,
  entry: number,
  bar: SpeedfloorPaperCandle,
): number {
  return dir === 'LONG' ? (bar.h - entry) / PIP_SIZE : (entry - bar.l) / PIP_SIZE;
}

export function hsExit(dir: AlphaOmegaDirection, entry: number): number {
  return dir === 'LONG'
    ? entry - HARD_STOP_PIPS * PIP_SIZE
    : entry + HARD_STOP_PIPS * PIP_SIZE;
}

export function stepGiveback(
  dir: AlphaOmegaDirection,
  entry: number,
  peakFav: number,
  bar: SpeedfloorPaperCandle,
): { nextPeak: number; shouldExit: boolean } {
  if (peakFav >= ALPHAOMEGA_GIVEBACK_ACTIVATION_PIPS) {
    const worstFav =
      dir === 'LONG' ? (bar.l - entry) / PIP_SIZE : (entry - bar.h) / PIP_SIZE;
    if (peakFav - worstFav >= ALPHAOMEGA_GIVEBACK_PIPS) {
      return { nextPeak: peakFav, shouldExit: true };
    }
  }
  return {
    nextPeak: Math.max(peakFav, favorablePips(dir, entry, bar)),
    shouldExit: false,
  };
}

export function applyBackstop(
  state: PaperStreak,
  fire: SpeedfloorPaperFire,
  entryDir: AlphaOmegaDirection,
): { next: PaperStreak; backstop: boolean } {
  const gap = state.lastAt ? minutesBetween(state.lastAt, fire.firedAt) : 0;
  const continues = fire.direction === state.direction && gap <= MAX_INTRA_RUN_GAP_MINUTES;
  const nextDirection = continues ? state.direction! : fire.direction;
  const nextLength = continues ? state.length + 1 : 1;
  const nextStart = continues ? state.startAt! : fire.firedAt;
  const backstop =
    !!state.armed &&
    state.armedDirection === entryDir &&
    fire.direction !== entryDir;
  let armed = backstop ? false : state.armed;
  let armedDirection = backstop ? null : state.armedDirection;
  if (!armed && nextLength >= ENTRY_STREAK_LENGTH) {
    const duration = minutesBetween(nextStart, fire.firedAt);
    if (duration >= 0 && duration <= ENTRY_SPEED_CEILING_MIN) {
      armed = true;
      armedDirection = nextDirection;
    }
  }
  return {
    next: {
      direction: nextDirection,
      length: nextLength,
      startAt: nextStart,
      lastAt: fire.firedAt,
      armed,
      armedDirection,
    },
    backstop,
  };
}

export function signedSpeedfloorPaperPips(
  dir: AlphaOmegaDirection,
  entry: number,
  exit: number,
): number {
  const raw = dir === 'LONG' ? (exit - entry) / PIP_SIZE : (entry - exit) / PIP_SIZE;
  return Math.round(raw * 10) / 10;
}
