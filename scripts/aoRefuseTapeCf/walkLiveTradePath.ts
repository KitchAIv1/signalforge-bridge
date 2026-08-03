/**
 * Walk live AO fill→exit on M5 for MFE/MAE and no-follow-through abort CF.
 * Reuses firstCandleAtOrAfter from validated AO 2y walker.
 */

import { firstCandleAtOrAfter } from '../alphaOmega2yBacktest/walkAoTradeExit.js';
import type { AoCandle } from '../alphaOmega2yBacktest/aoTypes.js';
import type { TradePathMetrics } from './types.js';

const PIP = 0.0001;

export interface AbortParams {
  minHoldMinutes: number;
  mfeMaxPips: number;
  maeMinPips: number;
}

const DEFAULT_ABORT: AbortParams = {
  minHoldMinutes: 30,
  mfeMaxPips: 1.5,
  maeMinPips: 3,
};

function favorablePips(direction: string, entry: number, high: number, low: number): number {
  return direction === 'LONG' ? (high - entry) / PIP : (entry - low) / PIP;
}

function adversePips(direction: string, entry: number, high: number, low: number): number {
  return direction === 'LONG' ? (entry - low) / PIP : (high - entry) / PIP;
}

export function walkLiveTradePath(
  candles: readonly AoCandle[],
  direction: string,
  entryAt: string,
  entryPrice: number,
  exitAt: string,
  abort: AbortParams = DEFAULT_ABORT,
): TradePathMetrics {
  const dir = direction.toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const startIdx = firstCandleAtOrAfter(candles, entryAt);
  const exitMs = Date.parse(exitAt);
  const entryMs = Date.parse(entryAt);
  const abortMs = entryMs + abort.minHoldMinutes * 60_000;

  let mfe = 0;
  let mae = 0;
  let abortTriggered = false;
  let abortAt: string | null = null;
  let abortPips: number | null = null;

  for (let i = startIdx; i < candles.length; i += 1) {
    const bar = candles[i]!;
    const barMs = Date.parse(bar.time);
    if (barMs > exitMs) break;

    const fav = favorablePips(dir, entryPrice, bar.h, bar.l);
    const adv = adversePips(dir, entryPrice, bar.h, bar.l);
    if (fav > mfe) mfe = fav;
    if (adv > mae) mae = adv;

    if (!abortTriggered && barMs >= abortMs && mfe < abort.mfeMaxPips && mae >= abort.maeMinPips) {
      abortTriggered = true;
      abortAt = bar.time;
      const mark = dir === 'LONG' ? bar.c - entryPrice : entryPrice - bar.c;
      abortPips = Math.round((mark / PIP) * 10) / 10;
    }
  }

  // Exact ~35m live exits can land between M5 stamps; if path stayed dead, abort at last bar.
  if (!abortTriggered && exitMs >= abortMs && mfe < abort.mfeMaxPips && mae >= abort.maeMinPips) {
    let lastBar: (typeof candles)[number] | null = null;
    for (let i = startIdx; i < candles.length; i += 1) {
      const bar = candles[i]!;
      if (Date.parse(bar.time) > exitMs) break;
      lastBar = bar;
    }
    if (lastBar) {
      abortTriggered = true;
      abortAt = lastBar.time;
      const mark = dir === 'LONG' ? lastBar.c - entryPrice : entryPrice - lastBar.c;
      abortPips = Math.round((mark / PIP) * 10) / 10;
    }
  }

  return {
    mfePips: Math.round(mfe * 10) / 10,
    maePips: Math.round(mae * 10) / 10,
    abortTriggered,
    abortAt,
    abortPips,
  };
}
