import { computePatternB } from './computePatternB.js';
import type { DetectionDirection, DetectionResult, M5Candle } from './types.js';
import { notDetectedResult, round1 } from './types.js';

const MAX_MOMENTUM_BAR = 36;

export function detectConditionB(candles: M5Candle[]): DetectionResult {
  const row = computePatternB(candles);
  const momentumBar = row.momentum_bars_in_direction;

  if (!row.pattern_b_match || momentumBar === 0 || momentumBar > MAX_MOMENTUM_BAR) {
    return notDetectedResult();
  }
  if (row.recovery_direction == null || momentumBar >= candles.length) {
    return notDetectedResult();
  }

  const direction: DetectionDirection = row.recovery_direction === 'up' ? 'long' : 'short';
  const open = candles[0].close;

  return {
    detected: true,
    detection_bar: momentumBar,
    direction,
    net_pips: round1((candles[momentumBar].close - open) * 10000),
  };
}
