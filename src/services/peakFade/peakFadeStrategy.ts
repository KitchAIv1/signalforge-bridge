/**
 * Peak-fade setup math — prior D1 extreme + trend-into-peak.
 * Pure functions only; no I/O.
 */

import { priorCompletedD1, type PeakFadeD1Bar, type PeakFadeM5Bar } from './peakFadeD1.js';
import type { PeakFadeConfig, PeakFadeDirection, PeakFadeSetup } from './peakFadeTypes.js';
import { pipsToPrice, priceToPips } from './peakFadeTypes.js';

function trendProgressPips(
  bars: readonly PeakFadeM5Bar[],
  barIndex: number,
  direction: PeakFadeDirection,
  trendBars: number,
): number | null {
  if (barIndex < trendBars) return null;
  const start = bars[barIndex - trendBars]!.close;
  const end = bars[barIndex]!.close;
  const delta = priceToPips(end - start);
  return direction === 'short' ? delta : -delta;
}

function evaluateDirection(
  bars: readonly PeakFadeM5Bar[],
  barIndex: number,
  prior: PeakFadeD1Bar,
  direction: PeakFadeDirection,
  cfg: PeakFadeConfig,
): PeakFadeSetup | null {
  const close = bars[barIndex]!.close;
  const refExtreme = direction === 'short' ? prior.high : prior.low;
  const nearPips =
    direction === 'short'
      ? priceToPips(refExtreme - close)
      : priceToPips(close - refExtreme);
  if (nearPips > cfg.nearExtremePips || nearPips < -cfg.nearExtremePips) {
    return null;
  }
  const progress = trendProgressPips(bars, barIndex, direction, cfg.trendBars);
  if (progress == null || progress < cfg.minTrendProgressPips) return null;
  const dirSign = direction === 'long' ? 1 : -1;
  return {
    direction,
    entry: close,
    tp: close + dirSign * pipsToPrice(cfg.targetPips),
    refDayKey: prior.dayKey,
    refExtreme,
    nearPips,
    trendProgressPips: progress,
  };
}

/** Evaluate last closed M5 bar against prior completed D1. */
export function evaluatePeakFadeSetup(
  bars: readonly PeakFadeM5Bar[],
  d1Bars: readonly PeakFadeD1Bar[],
  cfg: PeakFadeConfig,
): PeakFadeSetup | null {
  if (bars.length < cfg.trendBars + 1) return null;
  const barIndex = bars.length - 1;
  const asOfMs = bars[barIndex]!.timeMs;
  const prior = priorCompletedD1(d1Bars, asOfMs);
  if (!prior) return null;

  const shortSetup = evaluateDirection(bars, barIndex, prior, 'short', cfg);
  const longSetup = evaluateDirection(bars, barIndex, prior, 'long', cfg);
  if (shortSetup && longSetup) {
    return shortSetup.nearPips <= longSetup.nearPips ? shortSetup : longSetup;
  }
  return shortSetup ?? longSetup;
}
