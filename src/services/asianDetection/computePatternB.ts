import type { M5Candle } from './types.js';
import { round1 } from './types.js';
import type { MoveDirection } from './detectFalseBreak.js';

const MIN_BARS = 48;
const EARLY_BAR_END = 6;
const RECOVERY_BAR = 12;
const RECOVERY_TOLERANCE_PIPS = 2;
const MOMENTUM_SCAN_START = 12;
const MOMENTUM_SCAN_END = 72;
const MOMENTUM_WINDOW_SIZE = 12;
const MIN_MOMENTUM_NET_PIPS = 5;
const MAX_ADVERSE_PIPS = 3;
const HIGHER_LOW_BUFFER_PIPS = 2;
const MIN_POST_CONFIRM_PIPS = 10;

export interface PatternBRow {
  early_low: number | null;
  early_high: number | null;
  early_extreme_bar: number | null;
  recovery_confirmed: boolean;
  recovery_direction: MoveDirection | null;
  momentum_bars_in_direction: number;
  momentum_confirmed: boolean;
  higher_low_confirmed: boolean;
  pattern_b_match: boolean;
}

function earlyExtreme(candles: M5Candle[], sessionOpen: number): {
  direction: MoveDirection;
  extremeBar: number;
  earlyLow: number;
  earlyHigh: number;
} | null {
  const earlyBars = candles.slice(0, EARLY_BAR_END);
  if (earlyBars.length < EARLY_BAR_END) return null;
  const earlyLow = Math.min(...earlyBars.map((candle) => candle.low));
  const earlyHigh = Math.max(...earlyBars.map((candle) => candle.high));
  const lowPips = round1((sessionOpen - earlyLow) * 10000);
  const highPips = round1((earlyHigh - sessionOpen) * 10000);
  if (lowPips <= 0 && highPips <= 0) return null;
  if (lowPips >= highPips) {
    const extremeBar = earlyBars.findIndex((candle) => candle.low === earlyLow);
    return { direction: 'up', extremeBar, earlyLow, earlyHigh };
  }
  const extremeBar = earlyBars.findIndex((candle) => candle.high === earlyHigh);
  return { direction: 'down', extremeBar, earlyLow, earlyHigh };
}

function recoveryConfirmed(candles: M5Candle[], sessionOpen: number): boolean {
  if (candles.length <= RECOVERY_BAR) return false;
  const closeGapPips = Math.abs((candles[RECOVERY_BAR].close - sessionOpen) * 10000);
  return closeGapPips <= RECOVERY_TOLERANCE_PIPS;
}

function maxAdverseUp(window: M5Candle[]): number {
  return Math.max(...window.map((candle, index) => (
    index === 0 ? 0 : Math.max(0, (window[index - 1].close - candle.close) * 10000)
  )));
}

function maxAdverseDown(window: M5Candle[]): number {
  return Math.max(...window.map((candle, index) => (
    index === 0 ? 0 : Math.max(0, (candle.close - window[index - 1].close) * 10000)
  )));
}

function scanMomentumWindow(
  candles: M5Candle[],
  direction: MoveDirection,
): { startBar: number | null } {
  for (let startBar = MOMENTUM_SCAN_START; startBar < MOMENTUM_SCAN_END; startBar += 1) {
    const window = candles.slice(startBar, startBar + MOMENTUM_WINDOW_SIZE);
    if (window.length < MOMENTUM_WINDOW_SIZE) break;

    if (direction === 'up') {
      const netUp = (window[11].close - window[0].open) * 10000;
      if (netUp >= MIN_MOMENTUM_NET_PIPS && maxAdverseUp(window) < MAX_ADVERSE_PIPS) {
        return { startBar };
      }
      continue;
    }

    const netDown = (window[0].open - window[11].close) * 10000;
    if (netDown >= MIN_MOMENTUM_NET_PIPS && maxAdverseDown(window) < MAX_ADVERSE_PIPS) {
      return { startBar };
    }
  }
  return { startBar: null };
}

function findHigherLow(
  candles: M5Candle[],
  extremeBar: number,
  earlyLow: number,
  earlyHigh: number,
  direction: MoveDirection,
): { price: number; bar: number } | null {
  const buffer = HIGHER_LOW_BUFFER_PIPS / 10000;
  const postBars = candles.slice(extremeBar + 1);
  if (postBars.length === 0) return null;

  if (direction === 'up') {
    const threshold = earlyLow + buffer;
    let best: { price: number; bar: number } | null = null;
    postBars.forEach((candle, index) => {
      if (candle.close <= threshold) return;
      if (!best || candle.close < best.price) {
        best = { price: candle.close, bar: extremeBar + 1 + index };
      }
    });
    return best;
  }

  const threshold = earlyHigh - buffer;
  let best: { price: number; bar: number } | null = null;
  postBars.forEach((candle, index) => {
    if (candle.close >= threshold) return;
    if (!best || candle.close > best.price) {
      best = { price: candle.close, bar: extremeBar + 1 + index };
    }
  });
  return best;
}

function postConfirmationMovePips(
  candles: M5Candle[],
  direction: MoveDirection,
  higherLowPrice: number,
): number {
  const sessionHigh = Math.max(...candles.map((candle) => candle.high));
  const sessionLow = Math.min(...candles.map((candle) => candle.low));
  if (direction === 'up') {
    return round1((sessionHigh - higherLowPrice) * 10000);
  }
  return round1((higherLowPrice - sessionLow) * 10000);
}

function emptyPatternB(): PatternBRow {
  return {
    early_low: null,
    early_high: null,
    early_extreme_bar: null,
    recovery_confirmed: false,
    recovery_direction: null,
    momentum_bars_in_direction: 0,
    momentum_confirmed: false,
    higher_low_confirmed: false,
    pattern_b_match: false,
  };
}

export function computePatternB(candles: M5Candle[]): PatternBRow {
  if (candles.length < MIN_BARS) return emptyPatternB();

  const sessionOpen = candles[0].open;
  const extreme = earlyExtreme(candles, sessionOpen);
  if (!extreme) return emptyPatternB();

  const recovered = recoveryConfirmed(candles, sessionOpen);
  const momentum = scanMomentumWindow(candles, extreme.direction);
  const momentumOk = momentum.startBar != null;
  const higherLow = findHigherLow(
    candles,
    extreme.extremeBar,
    extreme.earlyLow,
    extreme.earlyHigh,
    extreme.direction,
  );
  const higherLowOk = higherLow != null;

  let postMovePips = 0;
  if (higherLow) {
    postMovePips = postConfirmationMovePips(candles, extreme.direction, higherLow.price);
  }

  const patternMatch = recovered && momentumOk && higherLowOk && postMovePips >= MIN_POST_CONFIRM_PIPS;

  return {
    early_low: extreme.earlyLow,
    early_high: extreme.earlyHigh,
    early_extreme_bar: extreme.extremeBar,
    recovery_confirmed: recovered,
    recovery_direction: extreme.direction,
    momentum_bars_in_direction: momentum.startBar ?? 0,
    momentum_confirmed: momentumOk,
    higher_low_confirmed: higherLowOk,
    pattern_b_match: patternMatch,
  };
}
