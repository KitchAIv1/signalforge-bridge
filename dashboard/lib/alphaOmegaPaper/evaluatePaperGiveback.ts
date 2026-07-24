import {
  PAPER_GIVEBACK_ACTIVATION_PIPS,
  PAPER_GIVEBACK_PIPS,
  PAPER_PIP,
} from './paperSimConstants';
import { favorablePips } from './paperPathMath';
import type { PaperCandle } from './paperSimTypes';

export function evaluatePaperGiveback(
  direction: 'LONG' | 'SHORT',
  entry: number,
  peakFavorablePips: number,
  candle: PaperCandle,
): { nextPeak: number; shouldExit: boolean } {
  if (peakFavorablePips >= PAPER_GIVEBACK_ACTIVATION_PIPS) {
    const worstFav =
      direction === 'LONG'
        ? (candle.l - entry) / PAPER_PIP
        : (entry - candle.h) / PAPER_PIP;
    const retracement = peakFavorablePips - worstFav;
    if (retracement >= PAPER_GIVEBACK_PIPS) {
      return { nextPeak: peakFavorablePips, shouldExit: true };
    }
  }
  const candleFav = favorablePips(direction, entry, candle);
  return {
    nextPeak: Math.max(peakFavorablePips, candleFav),
    shouldExit: false,
  };
}
