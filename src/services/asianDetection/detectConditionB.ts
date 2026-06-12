import { computePatternB } from './computePatternB.js';
import type { DetectionDirection, DetectionResult, M5Candle } from './types.js';
import { notDetectedResult, round1 } from './types.js';

const MAX_MOMENTUM_BAR = 36;
const RECOVERY_BAR = 12;

function recoveryToDirection(
  recoveryDirection: 'up' | 'down' | null,
): DetectionDirection | null {
  if (recoveryDirection === 'up') return 'long';
  if (recoveryDirection === 'down') return 'short';
  return null;
}

function netPipsAtBar(candles: M5Candle[], bar: number): number | null {
  if (bar < 0 || bar >= candles.length) return null;
  return round1((candles[bar].close - candles[0].close) * 10000);
}

export function detectConditionB(candles: M5Candle[]): DetectionResult {
  const row = computePatternB(candles);
  const momentumBar = row.momentum_bars_in_direction;
  const evaluatedDirection = recoveryToDirection(row.recovery_direction);

  if (row.early_extreme_bar == null) {
    return notDetectedResult({ failure_reason: 'NO_EARLY_EXTREME' });
  }

  if (!row.recovery_confirmed) {
    return notDetectedResult({
      failure_reason: 'BELOW_THRESHOLD',
      evaluated_net_pips: netPipsAtBar(candles, RECOVERY_BAR),
      evaluated_direction: evaluatedDirection,
    });
  }

  if (!row.momentum_confirmed || momentumBar === 0) {
    return notDetectedResult({
      failure_reason: 'NO_MOMENTUM',
      evaluated_net_pips: netPipsAtBar(candles, RECOVERY_BAR),
      evaluated_direction: evaluatedDirection,
    });
  }

  if (momentumBar > MAX_MOMENTUM_BAR) {
    return notDetectedResult({
      failure_reason: 'NO_MOMENTUM',
      evaluated_net_pips: netPipsAtBar(candles, momentumBar),
      evaluated_direction: evaluatedDirection,
    });
  }

  if (!row.higher_low_confirmed || !row.pattern_b_match) {
    return notDetectedResult({
      failure_reason: 'BELOW_THRESHOLD',
      evaluated_net_pips: netPipsAtBar(candles, momentumBar),
      evaluated_direction: evaluatedDirection,
    });
  }

  if (row.recovery_direction == null || momentumBar >= candles.length) {
    return notDetectedResult({
      failure_reason: 'NO_MOMENTUM',
      evaluated_net_pips: netPipsAtBar(candles, momentumBar),
      evaluated_direction: evaluatedDirection,
    });
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
