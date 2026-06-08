import { computePatternA } from './computePatternA.js';
import type { DetectionDirection, DetectionResult, M5Candle } from './types.js';
import { notDetectedResult, round1 } from './types.js';

function detectionDirection(falseBreakDirection: 'up' | 'down'): DetectionDirection {
  return falseBreakDirection === 'down' ? 'short' : 'long';
}

export function detectConditionA(candles: M5Candle[]): DetectionResult {
  const row = computePatternA(candles);
  if (!row.pattern_a_match || row.false_break_bar == null || row.false_break_direction == null) {
    return notDetectedResult();
  }

  const confirmBar = row.false_break_bar + 2;
  const detectionBar = confirmBar + 1;
  if (detectionBar >= candles.length) return notDetectedResult();

  const open = candles[0].close;
  const direction = detectionDirection(row.false_break_direction);

  return {
    detected: true,
    detection_bar: detectionBar,
    direction,
    net_pips: round1((candles[detectionBar].close - open) * 10000),
  };
}
