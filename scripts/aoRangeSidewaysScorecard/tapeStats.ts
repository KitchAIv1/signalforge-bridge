/**
 * M5 tape stats for AO range/sideways scorecard (read-only research).
 */

import type { AoCandle } from '../alphaOmega2yBacktest/aoTypes.js';

export const PIP = 0.0001;
export const MIN_BARS_CAUSAL = 24;
export const MIN_RANGE_PIPS = 15;

export interface TapeStats {
  rangePips: number;
  netPips: number;
  efficiency: number;
  flipRate: number;
  avgBarRange: number;
  nBars: number;
}

export function emptyTapeStats(): TapeStats {
  return {
    rangePips: 0,
    netPips: 0,
    efficiency: 0,
    flipRate: 0,
    avgBarRange: 0,
    nBars: 0,
  };
}

export function computeTapeStats(bars: readonly AoCandle[]): TapeStats {
  if (bars.length < 2) return emptyTapeStats();
  let hi = -Infinity;
  let lo = Infinity;
  let sumBar = 0;
  let flips = 0;
  let prevSign = 0;
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    if (bar.h > hi) hi = bar.h;
    if (bar.l < lo) lo = bar.l;
    sumBar += (bar.h - bar.l) / PIP;
    if (i > 0) {
      const delta = bars[i]!.c - bars[i - 1]!.c;
      const sign = delta > 0 ? 1 : delta < 0 ? -1 : 0;
      if (sign !== 0 && prevSign !== 0 && sign !== prevSign) flips += 1;
      if (sign !== 0) prevSign = sign;
    }
  }
  const rangePips = (hi - lo) / PIP;
  const netPips = (bars[bars.length - 1]!.c - bars[0]!.o) / PIP;
  const efficiency = rangePips > 0 ? Math.abs(netPips) / rangePips : 0;
  const steps = Math.max(bars.length - 1, 1);
  return {
    rangePips: round1(rangePips),
    netPips: round1(netPips),
    efficiency: round3(efficiency),
    flipRate: round3(flips / steps),
    avgBarRange: round1(sumBar / bars.length),
    nBars: bars.length,
  };
}

/** Bars with time < entryAt, last `windowBars` complete M5 candles. */
export function rollingBarsBeforeEntry(
  candles: readonly AoCandle[],
  entryAt: string,
  windowBars: number,
): AoCandle[] {
  const entryMs = Date.parse(entryAt);
  const before: AoCandle[] = [];
  for (const bar of candles) {
    if (Date.parse(bar.time) < entryMs) before.push(bar);
  }
  if (before.length <= windowBars) return before;
  return before.slice(before.length - windowBars);
}

export function utcDayBars(
  candles: readonly AoCandle[],
  day: string,
): AoCandle[] {
  return candles.filter((c) => c.time.slice(0, 10) === day);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
