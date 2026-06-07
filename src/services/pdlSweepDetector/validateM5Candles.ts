import { utcHourFromTime, utcMinuteFromTime } from './parseChartOhlc.js';
import type { StoredM5Candle } from './pdlSweepTypes.js';

export type M5ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

function isHourMinute(time: string, hour: number, minute: number): boolean {
  return utcHourFromTime(time) === hour && utcMinuteFromTime(time) === minute;
}

export function validateDetectorM5Candles(candles: StoredM5Candle[]): M5ValidationResult {
  if (candles.length < 24) {
    return { ok: false, reason: `Expected >=24 candles, got ${candles.length}` };
  }
  const firstTime = candles[0]?.time;
  const lastTime = candles[23]?.time;
  if (!firstTime || !lastTime) {
    return { ok: false, reason: 'Missing candles[0] or candles[23] time' };
  }
  if (!isHourMinute(firstTime, 10, 0)) {
    return { ok: false, reason: `candles[0].time=${firstTime} is not 10:00 UTC` };
  }
  if (!isHourMinute(lastTime, 11, 55)) {
    return { ok: false, reason: `candles[23].time=${lastTime} is not 11:55 UTC` };
  }
  return { ok: true };
}

export function validateOutcomeM5Candles(candles: StoredM5Candle[]): M5ValidationResult {
  if (candles.length < 12) {
    return { ok: false, reason: `Expected >=12 candles, got ${candles.length}` };
  }
  const firstTime = candles[0]?.time;
  const lastTime = candles[11]?.time;
  if (!firstTime || !lastTime) {
    return { ok: false, reason: 'Missing candles[0] or candles[11] time' };
  }
  if (!isHourMinute(firstTime, 12, 0)) {
    return { ok: false, reason: `candles[0].time=${firstTime} is not 12:00 UTC` };
  }
  if (!isHourMinute(lastTime, 12, 55)) {
    return { ok: false, reason: `candles[11].time=${lastTime} is not 12:55 UTC` };
  }
  return { ok: true };
}
