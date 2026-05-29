import type { OhlcCandle } from '../../src/services/amdDetector/amdFeatures.js';
import type { JudasDirection } from '../../src/services/amdDetector/amdTypes.js';

function parseMid(
  candle: OhlcCandle,
  field: 'o' | 'h' | 'l' | 'c'
): number | null {
  const raw = candle.mid?.[field];
  const parsed = parseFloat(String(raw ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeCompressionBreakout(
  judasDirection: JudasDirection | null,
  londonOpenPrice: number | null,
  distCandles: OhlcCandle[]
): boolean {
  if (londonOpenPrice == null || distCandles.length === 0) return false;
  const distCloses = distCandles
    .map((c) => parseMid(c, 'c'))
    .filter((v): v is number => v != null);
  if (distCloses.length === 0) return false;
  const bestDistClose =
    judasDirection === 'UP'
      ? Math.max(...distCloses)
      : Math.min(...distCloses);
  if (judasDirection === 'UP') return bestDistClose - londonOpenPrice > 0.001;
  if (judasDirection === 'DOWN') return londonOpenPrice - bestDistClose > 0.001;
  return false;
}

export function computeDelayedDistribution(
  byHour: Map<number, OhlcCandle>,
  distCandles: OhlcCandle[],
  londonOpenPrice: number | null
): boolean {
  const nyCandles: OhlcCandle[] = [];
  for (const hour of [17, 18, 19, 20, 21]) {
    const candle = byHour.get(hour);
    if (candle) nyCandles.push(candle);
  }
  if (nyCandles.length < 2 || londonOpenPrice == null) return false;
  const nyHigh = Math.max(...nyCandles.map((c) => parseMid(c, 'h') ?? 0));
  const nyLow = Math.min(...nyCandles.map((c) => parseMid(c, 'l') ?? Infinity));
  const nyRange = Math.round((nyHigh - nyLow) * 10000);
  if (distCandles.length === 0) return nyRange > 25;
  const distHigh = Math.max(...distCandles.map((c) => parseMid(c, 'h') ?? 0));
  const distLow = Math.min(...distCandles.map((c) => parseMid(c, 'l') ?? Infinity));
  const distRange = Math.round((distHigh - distLow) * 10000);
  return nyRange > 25 && distRange < 20;
}
