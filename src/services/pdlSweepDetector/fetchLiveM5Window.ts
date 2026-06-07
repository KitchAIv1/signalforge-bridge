import { fetchCompletedCandles } from '../../connectors/oanda.js';
import { mapOandaCandles } from './mapOandaCandles.js';
import {
  DETECTOR_M5_FROM_SUFFIX,
  DETECTOR_M5_TO_SUFFIX,
  OUTCOME_M5_FROM_SUFFIX,
  OUTCOME_M5_TO_SUFFIX,
  PDL_SWEEP_PAIR,
} from './pdlSweepConstants.js';
import type { StoredM5Candle } from './pdlSweepTypes.js';

function buildWindow(tradeDate: string, fromSuffix: string, toSuffix: string) {
  return {
    fromISO: `${tradeDate}T${fromSuffix}`,
    toISO: `${tradeDate}T${toSuffix}`,
  };
}

export async function fetchDetectorM5Candles(tradeDate: string): Promise<StoredM5Candle[]> {
  const window = buildWindow(tradeDate, DETECTOR_M5_FROM_SUFFIX, DETECTOR_M5_TO_SUFFIX);
  const raw = await fetchCompletedCandles(PDL_SWEEP_PAIR, 'M5', window.fromISO, window.toISO);
  return mapOandaCandles(raw);
}

export async function fetchOutcomeM5Candles(tradeDate: string): Promise<StoredM5Candle[]> {
  const window = buildWindow(tradeDate, OUTCOME_M5_FROM_SUFFIX, OUTCOME_M5_TO_SUFFIX);
  const raw = await fetchCompletedCandles(PDL_SWEEP_PAIR, 'M5', window.fromISO, window.toISO);
  return mapOandaCandles(raw);
}
