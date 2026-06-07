import type { HourDirection, StoredM5Candle } from './pdlSweepTypes.js';
import { HOUR_DIR_THRESHOLD_PIPS } from './pdlSweepConstants.js';

export function sumBodyPips(candles: StoredM5Candle[], start: number, end: number): number {
  let total = 0;
  for (let index = start; index <= end; index += 1) {
    const open = parseFloat(candles[index].o);
    const close = parseFloat(candles[index].c);
    total += (close - open) * 10000;
  }
  return Math.round(total * 10) / 10;
}

export function netToDirection(netPips: number): HourDirection {
  if (netPips > HOUR_DIR_THRESHOLD_PIPS) return 'UP';
  if (netPips < -HOUR_DIR_THRESHOLD_PIPS) return 'DOWN';
  return 'FLAT';
}

export function sessionDirection(netPips: number, thresholdPips: number): HourDirection {
  if (netPips > thresholdPips) return 'UP';
  if (netPips < -thresholdPips) return 'DOWN';
  return 'FLAT';
}
