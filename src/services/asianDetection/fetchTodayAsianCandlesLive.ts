import { fetchCompletedCandles } from '../../connectors/oanda.js';
import { ASIAN_M5_PAIR } from '../asianM5/asianM5Constants.js';
import type { M5Candle } from './types.js';

function utcTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseMid(value: string): number {
  return parseFloat(value);
}

function mapOandaCandles(
  raw: Awaited<ReturnType<typeof fetchCompletedCandles>>,
): M5Candle[] {
  return raw.map((candle) => ({
    time: candle.time,
    open: parseMid(candle.mid.o),
    high: parseMid(candle.mid.h),
    low: parseMid(candle.mid.l),
    close: parseMid(candle.mid.c),
  }));
}

function lastCompleteBarEndIso(tradeDate: string): string {
  const now = new Date();
  const aligned = new Date(now);
  aligned.setUTCSeconds(0, 0);
  const minute = aligned.getUTCMinutes();
  aligned.setUTCMinutes(minute - (minute % 5) - 1);
  if (aligned.getUTCMinutes() < 0) {
    aligned.setUTCHours(aligned.getUTCHours() - 1);
    aligned.setUTCMinutes(55);
  }
  return aligned.toISOString().replace('.000Z', '.000000000Z');
}

export async function fetchTodayAsianCandlesLive(barsNeeded: number): Promise<M5Candle[]> {
  const tradeDate = utcTodayDate();
  const fromISO = `${tradeDate}T00:00:00.000000000Z`;
  const toISO = lastCompleteBarEndIso(tradeDate);

  const raw = await fetchCompletedCandles(ASIAN_M5_PAIR, 'M5', fromISO, toISO);
  const candles = mapOandaCandles(raw);
  return candles.slice(0, barsNeeded);
}
