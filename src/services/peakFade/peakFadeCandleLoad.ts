/** Load recent AUDUSD M5 bars for peak-fade evaluation. */

import { fetchCompletedCandles } from '../../connectors/oanda.js';
import type { BrokerClient } from '../../connectors/broker/types.js';
import { clampOandaToIso } from '../../utils/oandaCandleToIso.js';
import type { PeakFadeM5Bar } from './peakFadeD1.js';

const LOOKBACK_MS = 10 * 24 * 60 * 60 * 1000;

function mapCandles(
  candles: Array<{ time: string; mid: { o: string; h: string; l: string; c: string } }>,
): PeakFadeM5Bar[] {
  return candles
    .map((candle) => ({
      timeMs: Date.parse(candle.time),
      open: Number(candle.mid.o),
      high: Number(candle.mid.h),
      low: Number(candle.mid.l),
      close: Number(candle.mid.c),
    }))
    .filter(
      (bar) =>
        Number.isFinite(bar.timeMs) &&
        Number.isFinite(bar.open) &&
        Number.isFinite(bar.high) &&
        Number.isFinite(bar.low) &&
        Number.isFinite(bar.close),
    )
    .sort((a, b) => a.timeMs - b.timeMs);
}

export async function loadPeakFadeM5FromOanda(pair: string): Promise<PeakFadeM5Bar[]> {
  const toISO = clampOandaToIso(new Date().toISOString());
  const fromISO = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const candles = await fetchCompletedCandles(pair, 'M5', fromISO, toISO);
  return mapCandles(candles);
}

export async function loadPeakFadeM5FromBroker(
  broker: BrokerClient,
  pair: string,
): Promise<PeakFadeM5Bar[]> {
  const toISO = clampOandaToIso(new Date().toISOString());
  const fromISO = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const instrument = broker.toBrokerInstrument(pair);
  const candles = await broker.fetchCompletedCandles(instrument, 'M5', fromISO, toISO);
  return mapCandles(candles);
}
