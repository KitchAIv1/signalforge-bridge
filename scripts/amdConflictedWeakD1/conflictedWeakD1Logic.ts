/** Pure helpers — CONFLICTED weak/strong D1 backtest (no I/O). */

import type { M5Bar } from '../regimeVsAmd/regimeVsAmdM5Walk.js';

export type TradeDirection = 'long' | 'short' | 'flat';

const NET_FLAT_PIPS = 3;
const FIRST_WINDOW_BARS = 36;
export const PEAK_TRADEABLE_PIPS = 8;

export type First36Analysis = {
  netPips: number;
  netActualDirection: TradeDirection;
  peakFavorableJudas: number;
  peakFavorableD1: number;
  peakActualDirection: TradeDirection;
};

export function classifyD1Strength(
  bullishCount: number | null,
  bearishCount: number | null
): 'weak' | 'strong' | 'other' {
  if (bullishCount == null || bearishCount == null) return 'other';
  if (bullishCount === 2 || bearishCount === 2) return 'weak';
  if (Math.max(bullishCount, bearishCount) >= 4) return 'strong';
  return 'other';
}

export function judasInversionDirection(
  judasDirection: string | null
): 'long' | 'short' | null {
  if (judasDirection === 'UP') return 'short';
  if (judasDirection === 'DOWN') return 'long';
  return null;
}

export function d1BiasToDirection(layer4D1Bias: string | null): 'long' | 'short' | null {
  if (layer4D1Bias === 'TRENDING_UP') return 'long';
  if (layer4D1Bias === 'TRENDING_DOWN') return 'short';
  return null;
}

function sortedFirst36Bars(candles: M5Bar[]): M5Bar[] {
  const sorted = [...candles].sort(
    (barA, barB) => new Date(barA.time).getTime() - new Date(barB.time).getTime()
  );
  return sorted.slice(0, FIRST_WINDOW_BARS);
}

function netDirectionFromPips(netPips: number): TradeDirection {
  if (netPips > NET_FLAT_PIPS) return 'long';
  if (netPips < -NET_FLAT_PIPS) return 'short';
  return 'flat';
}

function peakFavorableLong(refOpen: number, windowBars: M5Bar[]): number {
  let peak = 0;
  for (const bar of windowBars) {
    const high = parseFloat(bar.h);
    if (Number.isFinite(high)) {
      peak = Math.max(peak, Math.round((high - refOpen) * 10000));
    }
  }
  return peak;
}

function peakFavorableShort(refOpen: number, windowBars: M5Bar[]): number {
  let peak = 0;
  for (const bar of windowBars) {
    const low = parseFloat(bar.l);
    if (Number.isFinite(low)) {
      peak = Math.max(peak, Math.round((refOpen - low) * 10000));
    }
  }
  return peak;
}

function peakActualFromSides(peakLong: number, peakShort: number): TradeDirection {
  if (peakLong > peakShort) return 'long';
  if (peakShort > peakLong) return 'short';
  return 'flat';
}

/** @deprecated comparison only — use analyzeFirst36Window for scoring */
export function netDirectionFirst36Bars(candles: M5Bar[]): TradeDirection {
  const analysis = analyzeFirst36Window(candles, null, null);
  return analysis?.netActualDirection ?? 'flat';
}

export function analyzeFirst36Window(
  candles: M5Bar[],
  judasPred: 'long' | 'short' | null,
  d1Pred: 'long' | 'short' | null
): First36Analysis | null {
  const windowBars = sortedFirst36Bars(candles);
  if (windowBars.length < 2) return null;

  const refOpen = parseFloat(windowBars[0]!.o);
  const lastClose = parseFloat(windowBars[windowBars.length - 1]!.c);
  if (!Number.isFinite(refOpen) || !Number.isFinite(lastClose)) return null;

  const netPips = Math.round((lastClose - refOpen) * 10000);
  const peakLong = peakFavorableLong(refOpen, windowBars);
  const peakShort = peakFavorableShort(refOpen, windowBars);

  const peakFavorableJudas =
    judasPred === 'long' ? peakLong : judasPred === 'short' ? peakShort : 0;
  const peakFavorableD1 = d1Pred === 'long' ? peakLong : d1Pred === 'short' ? peakShort : 0;

  return {
    netPips,
    netActualDirection: netDirectionFromPips(netPips),
    peakFavorableJudas,
    peakFavorableD1,
    peakActualDirection: peakActualFromSides(peakLong, peakShort),
  };
}

export function isPeakMoveCorrect(
  peakFavorablePips: number,
  hasPrediction: boolean
): boolean | null {
  if (!hasPrediction) return null;
  return peakFavorablePips >= PEAK_TRADEABLE_PIPS;
}

export function classifyTrendStability(
  tradeDate: string,
  layer4D1Bias: string | null,
  biasByTradeDate: Map<string, string | null>
): 'stable_trend' | 'transitioning' | 'unknown' {
  const sortedDates = [...biasByTradeDate.keys()].sort();
  const dayIndex = sortedDates.indexOf(tradeDate);
  if (dayIndex < 2) return 'unknown';

  const todayBias = layer4D1Bias;
  const prior1Bias = biasByTradeDate.get(sortedDates[dayIndex - 1]!);
  const prior2Bias = biasByTradeDate.get(sortedDates[dayIndex - 2]!);
  const trendBiases = [todayBias, prior1Bias, prior2Bias];

  if (trendBiases.some((bias) => bias == null || bias === 'RANGING')) {
    return 'transitioning';
  }

  const unique = new Set(trendBiases);
  return unique.size === 1 ? 'stable_trend' : 'transitioning';
}
