/**
 * Run: npx tsx dashboard/scripts/testAsianSessionAmdMetrics.ts
 */
import assert from 'node:assert/strict';
import {
  buildAsianSessionAmdMetricsMap,
  resolveAsianSessionAmdMetricsDisplayState,
  type AsianSessionAmdMetricsSlice,
} from '../lib/asianSessionAmdMetricsTypes';

function slice(partial: Partial<AsianSessionAmdMetricsSlice> & { trade_date: string }): AsianSessionAmdMetricsSlice {
  return {
    evaluated_at: partial.evaluated_at ?? null,
    asian_close_bias_signal: null,
    asian_close_position_pct: null,
    accumulation_quality_score: null,
    asian_shape: null,
    asian_retracement_pct: null,
    asian_turn_time: null,
    asian_turn_position: null,
    ...partial,
  };
}

const referenceNow = new Date('2026-06-24T05:00:00.000Z');

assert.equal(
  resolveAsianSessionAmdMetricsDisplayState('2026-06-24', undefined, referenceNow),
  'pending',
);

assert.equal(
  resolveAsianSessionAmdMetricsDisplayState(
    '2026-06-23',
    slice({ trade_date: '2026-06-23', evaluated_at: '2026-06-23T10:31:00.000Z' }),
    referenceNow,
  ),
  'ready',
);

assert.equal(
  resolveAsianSessionAmdMetricsDisplayState('2026-06-20', undefined, referenceNow),
  'missing',
);

const metricsMap = buildAsianSessionAmdMetricsMap([
  slice({ trade_date: '2026-06-23', evaluated_at: '2026-06-23T10:31:00.000Z' }),
]);
assert.equal(metricsMap.get('2026-06-23')?.trade_date, '2026-06-23');

console.log('testAsianSessionAmdMetrics: all assertions passed');
