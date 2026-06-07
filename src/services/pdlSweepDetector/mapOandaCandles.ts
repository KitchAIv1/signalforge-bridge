import type { fetchCompletedCandles } from '../../connectors/oanda.js';
import type { StoredM5Candle } from './pdlSweepTypes.js';

/** Copied verbatim from distributionM5CandleFetch.ts mapOandaCandles */
export function mapOandaCandles(
  raw: Awaited<ReturnType<typeof fetchCompletedCandles>>,
): StoredM5Candle[] {
  return raw.map((candle) => ({
    time: candle.time,
    o: candle.mid.o,
    h: candle.mid.h,
    l: candle.mid.l,
    c: candle.mid.c,
  }));
}
