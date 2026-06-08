import type { M5Candle } from './types.js';
import { detectFalseBreak, round1 } from './detectFalseBreak.js';
import type { MoveDirection } from './detectFalseBreak.js';

const COIL_TIGHT_PIPS = 15;
const MIN_BARS = 48;
const MIN_PRE_SPIKE_BARS = 12;
const MIN_POST_FB_PIPS = 10;

interface PatternARow {
  false_break_bar: number | null;
  false_break_direction: MoveDirection | null;
  pattern_a_match: boolean;
}

function coilFromPreSpike(
  candles: M5Candle[],
  falseBreakBar: number,
): { coilIsTight: boolean } {
  const spikeOnsetBar = Math.max(0, falseBreakBar - 2);
  const preSpikeBars = candles.slice(0, spikeOnsetBar);
  if (preSpikeBars.length < MIN_PRE_SPIKE_BARS) {
    return { coilIsTight: false };
  }
  const coilHigh = Math.max(...preSpikeBars.map((candle) => candle.high));
  const coilLow = Math.min(...preSpikeBars.map((candle) => candle.low));
  const coilRangePips = round1((coilHigh - coilLow) * 10000);
  return { coilIsTight: coilRangePips < COIL_TIGHT_PIPS };
}

export function computePatternA(candles: M5Candle[]): PatternARow {
  const incomplete = candles.length < MIN_BARS;
  const falseBreak = incomplete
    ? {
      false_break_detected: false,
      false_break_direction: null,
      false_break_bar: null,
      post_fb_move_pips: null,
    }
    : detectFalseBreak(candles);

  let coilIsTight = false;
  if (!incomplete && falseBreak.false_break_detected && falseBreak.false_break_bar != null) {
    coilIsTight = coilFromPreSpike(candles, falseBreak.false_break_bar).coilIsTight;
  }

  const postFbMove = falseBreak.post_fb_move_pips ?? 0;
  const patternMatch = coilIsTight
    && falseBreak.false_break_detected
    && postFbMove >= MIN_POST_FB_PIPS;

  return {
    false_break_bar: falseBreak.false_break_bar,
    false_break_direction: falseBreak.false_break_direction,
    pattern_a_match: patternMatch,
  };
}
