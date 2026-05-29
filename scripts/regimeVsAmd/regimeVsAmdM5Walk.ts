/** M5 distribution window (10:00–16:00 UTC) outcome metrics — no I/O. */

export type M5Bar = { time: string; o: string; h: string; l: string; c: string };

export type DistributionWalk = {
  actualDirection: 'long' | 'short' | 'flat';
  netPips: number;
  peakPipsLong: number;
  peakPipsShort: number;
};

const NET_FLAT_PIPS = 3;

export function walkDistributionCandles(candles: M5Bar[]): DistributionWalk {
  if (candles.length < 2) {
    return { actualDirection: 'flat', netPips: 0, peakPipsLong: 0, peakPipsShort: 0 };
  }
  const sorted = [...candles].sort(
    (barA, barB) => new Date(barA.time).getTime() - new Date(barB.time).getTime()
  );
  const refOpen = parseFloat(sorted[0]!.o);
  const lastClose = parseFloat(sorted[sorted.length - 1]!.c);
  if (!Number.isFinite(refOpen) || !Number.isFinite(lastClose)) {
    return { actualDirection: 'flat', netPips: 0, peakPipsLong: 0, peakPipsShort: 0 };
  }

  let rangeHigh = refOpen;
  let rangeLow = refOpen;
  for (const bar of sorted) {
    const high = parseFloat(bar.h);
    const low = parseFloat(bar.l);
    if (Number.isFinite(high) && high > rangeHigh) rangeHigh = high;
    if (Number.isFinite(low) && low < rangeLow) rangeLow = low;
  }

  const netPips = Math.round((lastClose - refOpen) * 10000);
  const peakPipsLong = Math.round((rangeHigh - refOpen) * 10000);
  const peakPipsShort = Math.round((refOpen - rangeLow) * 10000);
  const actualDirection =
    netPips > NET_FLAT_PIPS ? 'long' : netPips < -NET_FLAT_PIPS ? 'short' : 'flat';

  return { actualDirection, netPips, peakPipsLong, peakPipsShort };
}

export function peakPipsForPredicted(
  predicted: 'long' | 'short' | 'pause' | 'neutral',
  walk: DistributionWalk
): number | null {
  if (predicted === 'long') return walk.peakPipsLong;
  if (predicted === 'short') return walk.peakPipsShort;
  return null;
}

export function isDirectionCorrect(
  predicted: 'long' | 'short' | 'pause' | 'neutral',
  actual: 'long' | 'short' | 'flat'
): boolean | null {
  if (predicted === 'pause' || predicted === 'neutral') return null;
  if (actual === 'flat') return false;
  return predicted === actual;
}
