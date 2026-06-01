import type { DayBackfillResult } from './types.js';

export const GROUND_TRUTH_TRADE_DATE = '2026-06-01';
export const GROUND_TRUTH_DIRECTION = 'long';

export function assertGroundTruth(dayResult: DayBackfillResult): void {
  if (dayResult.trade_date !== GROUND_TRUTH_TRADE_DATE) return;
  if (dayResult.decision_direction === GROUND_TRUTH_DIRECTION) return;

  console.error(
    `[DecisionBackfill] GROUND TRUTH FAILED: ${GROUND_TRUTH_TRADE_DATE} must be ${GROUND_TRUTH_DIRECTION.toUpperCase()}`,
  );
  console.error('Got:', dayResult.decision_direction);
  console.error('D1 bars raw:', dayResult.d1_bars_raw);
  console.error('D1 bars used:', dayResult.d1_bars_used);
  console.error('D1 last dropped:', dayResult.d1_last_dropped_time);
  console.error('layer4_d1_bias:', dayResult.layer4_d1_bias);
  console.error('layer4_bullish:', dayResult.layer4_bullish);
  console.error('layer4_bearish:', dayResult.layer4_bearish);
  process.exit(1);
}
