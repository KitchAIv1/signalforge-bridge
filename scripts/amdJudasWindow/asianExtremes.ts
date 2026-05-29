import type { OhlcCandle } from '../../src/services/amdDetector/amdFeatures.js';

function parseMid(
  candle: OhlcCandle,
  field: 'h' | 'l' | 'c'
): number | null {
  const raw = candle.mid?.[field];
  const parsed = parseFloat(String(raw ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export type AsianExtremePrices = {
  asianHighPrice: number;
  asianLowPrice: number;
};

export function asianWickExtremes(
  asianCandles: OhlcCandle[]
): AsianExtremePrices | null {
  const highs: number[] = [];
  const lows: number[] = [];
  for (const candle of asianCandles) {
    const high = parseMid(candle, 'h');
    const low = parseMid(candle, 'l');
    if (high == null || low == null) return null;
    highs.push(high);
    lows.push(low);
  }
  if (highs.length < 4) return null;
  return { asianHighPrice: Math.max(...highs), asianLowPrice: Math.min(...lows) };
}

export type VSweepMetrics = {
  asianInternalSwingPips: number;
  asianRecoveryPct: number;
  isVSweep: boolean;
};

function utcHourFromCandle(candle: OhlcCandle): number {
  return new Date(candle.time).getUTCHours();
}

export function computeVSweepMetrics(
  asianCandles: OhlcCandle[]
): VSweepMetrics | null {
  if (asianCandles.length < 4) return null;

  let minLow = Infinity;
  let lowHour = 0;
  let maxHigh = -Infinity;
  let highHour = 0;

  for (const candle of asianCandles) {
    const low = parseMid(candle, 'l');
    const high = parseMid(candle, 'h');
    if (low == null || high == null) return null;
    const hour = utcHourFromCandle(candle);
    if (low < minLow) {
      minLow = low;
      lowHour = hour;
    }
    if (high > maxHigh) {
      maxHigh = high;
      highHour = hour;
    }
  }

  const swingPips = Math.round((maxHigh - minLow) * 10000);
  const lastClose = parseMid(asianCandles[asianCandles.length - 1]!, 'c');
  if (lastClose == null || swingPips < 25) {
    return {
      asianInternalSwingPips: swingPips,
      asianRecoveryPct: 0,
      isVSweep: false,
    };
  }

  const sweepMidpoint = (minLow + maxHigh) / 2;
  const minRecoveryPct = 30;

  // V_BOTTOM: session low after hour 2 (sweep down from early high, then recover)
  const isVBottomSweep = lowHour >= 2;
  const bottomRecoveryPct = ((lastClose - minLow) / (maxHigh - minLow)) * 100;
  const vBottomValid =
    isVBottomSweep &&
    bottomRecoveryPct >= minRecoveryPct &&
    lastClose > sweepMidpoint;

  // V_TOP: session high after hour 2 (sweep up from early low, then fade)
  const isVTopSweep = highHour >= 2;
  const topRecoveryPct = ((maxHigh - lastClose) / (maxHigh - minLow)) * 100;
  const vTopValid =
    isVTopSweep &&
    topRecoveryPct >= minRecoveryPct &&
    lastClose < sweepMidpoint;

  const recoveryPct = vBottomValid
    ? Math.round(bottomRecoveryPct * 10) / 10
    : vTopValid
      ? Math.round(topRecoveryPct * 10) / 10
      : Math.round(
          (1000 *
            Math.max(
              (lastClose - minLow) * 10000,
              (maxHigh - lastClose) * 10000
            )) /
            swingPips
        ) / 10;

  return {
    asianInternalSwingPips: swingPips,
    asianRecoveryPct: recoveryPct,
    isVSweep: vBottomValid || vTopValid,
  };
}
