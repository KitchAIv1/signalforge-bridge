import type { DetectionDirection, DetectionResult, M5Candle } from './types.js';
import { notDetectedResult, round1 } from './types.js';

const CHECK_BAR = 12;
const MIN_NET_PIPS = 15;
const MAX_ADVERSE_BAR_PIPS = 5;

export function detectConditionC(candles: M5Candle[]): DetectionResult {
  if (candles.length < CHECK_BAR + 1) return notDetectedResult();

  const open = candles[0].close;
  const bar12Close = candles[CHECK_BAR].close;
  const netPips = (bar12Close - open) * 10000;
  const absNet = Math.abs(netPips);
  const direction: DetectionDirection = netPips < 0 ? 'short' : 'long';

  if (absNet < MIN_NET_PIPS) return notDetectedResult();

  for (let bar = 1; bar <= CHECK_BAR; bar += 1) {
    const barMove = (candles[bar].close - candles[bar - 1].close) * 10000;
    const isAgainst = direction === 'short' ? barMove > MAX_ADVERSE_BAR_PIPS : barMove < -MAX_ADVERSE_BAR_PIPS;
    if (isAgainst) return notDetectedResult();
  }

  return {
    detected: true,
    detection_bar: CHECK_BAR,
    direction,
    net_pips: round1(netPips),
  };
}
