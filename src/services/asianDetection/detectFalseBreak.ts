import type { M5Candle } from './types.js';

export type MoveDirection = 'up' | 'down';

const FALSE_BREAK_PIPS = 3;

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface FalseBreakScan {
  false_break_detected: boolean;
  false_break_direction: MoveDirection | null;
  false_break_bar: number | null;
  false_break_pips: number | null;
  post_fb_move_pips: number | null;
  post_fb_move_bars: number | null;
}

function extremeBarAfter(
  candles: M5Candle[],
  startBar: number,
  direction: MoveDirection,
): number | null {
  let extreme = direction === 'down' ? Infinity : -Infinity;
  let extremeBar: number | null = null;
  for (let bar = startBar; bar < candles.length; bar += 1) {
    const value = direction === 'down' ? candles[bar].low : candles[bar].high;
    if (direction === 'down' ? value < extreme : value > extreme) {
      extreme = value;
      extremeBar = bar;
    }
  }
  return extremeBar;
}

export function detectFalseBreak(candles: M5Candle[]): FalseBreakScan {
  const empty: FalseBreakScan = {
    false_break_detected: false,
    false_break_direction: null,
    false_break_bar: null,
    false_break_pips: null,
    post_fb_move_pips: null,
    post_fb_move_bars: null,
  };
  if (candles.length < 48) return empty;

  const first2h = candles.slice(0, 24);
  const first2hHigh = Math.max(...first2h.map((candle) => candle.high));
  const first2hLow = Math.min(...first2h.map((candle) => candle.low));
  const upThreshold = first2hHigh + FALSE_BREAK_PIPS / 10000;
  const downThreshold = first2hLow - FALSE_BREAK_PIPS / 10000;

  for (let bar = 24; bar < candles.length - 2; bar += 1) {
    const candle = candles[bar];
    if (candle.high > upThreshold) {
      const nextCloses = [candles[bar + 1].close, candles[bar + 2].close];
      if (nextCloses.every((close) => close < first2hHigh)) {
        const confirmBar = bar + 2;
        const extremeBar = extremeBarAfter(candles, confirmBar + 1, 'down');
        const minLow = Math.min(...candles.slice(bar + 1).map((row) => row.low));
        return {
          false_break_detected: true,
          false_break_direction: 'down',
          false_break_bar: bar,
          false_break_pips: round1((candle.high - first2hHigh) * 10000),
          post_fb_move_pips: round1((candle.high - minLow) * 10000),
          post_fb_move_bars: extremeBar != null ? extremeBar - confirmBar : null,
        };
      }
    }
    if (candle.low < downThreshold) {
      const nextCloses = [candles[bar + 1].close, candles[bar + 2].close];
      if (nextCloses.every((close) => close > first2hLow)) {
        const confirmBar = bar + 2;
        const extremeBar = extremeBarAfter(candles, confirmBar + 1, 'up');
        const maxHigh = Math.max(...candles.slice(bar + 1).map((row) => row.high));
        return {
          false_break_detected: true,
          false_break_direction: 'up',
          false_break_bar: bar,
          false_break_pips: round1((first2hLow - candle.low) * 10000),
          post_fb_move_pips: round1((maxHigh - candle.low) * 10000),
          post_fb_move_bars: extremeBar != null ? extremeBar - confirmBar : null,
        };
      }
    }
  }
  return empty;
}
