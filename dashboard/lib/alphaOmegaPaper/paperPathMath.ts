import { PAPER_PIP } from './paperSimConstants';
import type { PaperCandle } from './paperSimTypes';

export function adversePips(
  direction: 'LONG' | 'SHORT',
  entry: number,
  candle: PaperCandle,
): number {
  return direction === 'LONG'
    ? (entry - candle.l) / PAPER_PIP
    : (candle.h - entry) / PAPER_PIP;
}

export function favorablePips(
  direction: 'LONG' | 'SHORT',
  entry: number,
  candle: PaperCandle,
): number {
  return direction === 'LONG'
    ? (candle.h - entry) / PAPER_PIP
    : (entry - candle.l) / PAPER_PIP;
}

export function hardStopExitPrice(
  direction: 'LONG' | 'SHORT',
  entry: number,
  stopPips: number,
): number {
  return direction === 'LONG'
    ? entry - stopPips * PAPER_PIP
    : entry + stopPips * PAPER_PIP;
}

export function signedPips(
  direction: 'LONG' | 'SHORT',
  entry: number,
  exit: number,
): number {
  const raw = direction === 'LONG' ? (exit - entry) / PAPER_PIP : (entry - exit) / PAPER_PIP;
  return Math.round(raw * 10) / 10;
}

export function firstCandleAtOrAfter(candles: readonly PaperCandle[], iso: string): number {
  let lo = 0;
  let hi = candles.length;
  const targetMs = Date.parse(iso);
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Date.parse(candles[mid]!.time) < targetMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
