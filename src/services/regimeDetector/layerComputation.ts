/**
 * Pure layer computation functions for the regime detector.
 * No I/O, no side effects. Each function is independently testable.
 */

type OandaCandle = {
  time: string;
  mid: { o: string; h: string; l: string; c: string };
};

export type Layer4Result = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING';
export type Layer5Result = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface Layer4Output {
  result:       Layer4Result;
  bullishCount: number;
  bearishCount: number;
}

export interface Layer5Output {
  result:   Layer5Result;
  pipDiff:  number;
  avgFirst3: number;
  avgLast3:  number;
}

export interface Layer6Output {
  positionPct: number;
}

/** Layer 4: D1 trend — counts bullish vs bearish in last 5 prior candles */
export function computeLayer4(
  d1Candles: OandaCandle[],
  targetDate: Date
): Layer4Output {
  const priorCandles = d1Candles
    .filter(c => new Date(c.time) < targetDate)
    .slice(-5);

  if (priorCandles.length < 5) {
    return { result: 'RANGING', bullishCount: 0, bearishCount: 0 };
  }

  let bullishCount = 0;
  let bearishCount = 0;

  for (const candle of priorCandles) {
    const open  = parseFloat(candle.mid.o);
    const close = parseFloat(candle.mid.c);
    if (close > open) bullishCount++;
    else if (close < open) bearishCount++;
  }

  const result: Layer4Result =
    bullishCount >= 3 ? 'TRENDING_UP' :
    bearishCount >= 3 ? 'TRENDING_DOWN' :
    'RANGING';

  return { result, bullishCount, bearishCount };
}

/** Layer 5: H4 structure — avg of last 3 H4 closes vs first 3, threshold 8 pips */
export function computeLayer5(
  h4Candles: OandaCandle[],
  targetDate: Date
): Layer5Output {
  const THRESHOLD_AUDUSD = 0.0008; // 8 pips

  const priorCandles = h4Candles
    .filter(c => new Date(c.time) < targetDate)
    .slice(-6);

  if (priorCandles.length < 6) {
    return { result: 'NEUTRAL', pipDiff: 0, avgFirst3: 0, avgLast3: 0 };
  }

  const avgFirst3 =
    priorCandles.slice(0, 3).reduce((sum, c) => sum + parseFloat(c.mid.c), 0) / 3;
  const avgLast3 =
    priorCandles.slice(3, 6).reduce((sum, c) => sum + parseFloat(c.mid.c), 0) / 3;

  const diff    = avgLast3 - avgFirst3;
  const pipDiff = Math.round(diff * 10000);

  const result: Layer5Result =
    diff >  THRESHOLD_AUDUSD ? 'BULLISH' :
    diff < -THRESHOLD_AUDUSD ? 'BEARISH' :
    'NEUTRAL';

  return { result, pipDiff, avgFirst3, avgLast3 };
}

/** Layer 6: 0-100% position of current price within 10-day D1 high/low range */
export function computeLayer6(
  d1Candles: OandaCandle[],
  targetDate: Date
): Layer6Output {
  const priorCandles = d1Candles
    .filter(c => new Date(c.time) < targetDate)
    .slice(-10);

  if (priorCandles.length < 10) return { positionPct: 50 };

  const rangeHigh    = Math.max(...priorCandles.map(c => parseFloat(c.mid.h)));
  const rangeLow     = Math.min(...priorCandles.map(c => parseFloat(c.mid.l)));
  const currentPrice = parseFloat(priorCandles[priorCandles.length - 1].mid.c);
  const rangeSize    = rangeHigh - rangeLow;

  const positionPct = rangeSize === 0
    ? 50
    : Math.round(((currentPrice - rangeLow) / rangeSize) * 100);

  return { positionPct };
}
