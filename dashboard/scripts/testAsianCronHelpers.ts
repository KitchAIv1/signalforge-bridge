/**
 * Run: npx tsx dashboard/scripts/testAsianCronHelpers.ts
 */
import assert from 'node:assert/strict';
import {
  allAsianCronsComplete,
  allCronsFiredToday,
  filterAsianCronRows,
} from '../lib/asianDetectionDisplayHelpers';
import type { AsianSessionDetection } from '../lib/directionDecisionTypes';

function row(partial: Partial<AsianSessionDetection>): AsianSessionDetection {
  return {
    id: partial.id ?? '1',
    trade_date: partial.trade_date ?? '2026-06-24',
    condition_fired: partial.condition_fired ?? null,
    condition_check_time: partial.condition_check_time ?? '01:00',
    detection_bar: null,
    detection_direction: null,
    detection_net_pips: null,
    prior_amd_shifted: false,
    prior_amd_tag: null,
    size_multiplier: null,
    confidence_tier: null,
    prior_direction_bias: null,
    action: partial.action ?? 'NO_DETECTION',
    direction_set: null,
    valid_until: null,
    candle_count: null,
    error_message: null,
    failure_reason: null,
    evaluated_net_pips: null,
    evaluated_direction: null,
    created_at: partial.created_at ?? '2026-06-24T01:00:00Z',
  };
}

const threeCronsPlus2110 = [
  row({ condition_check_time: '21:10', action: 'D1_FALLBACK_SKIPPED_WEAK_D1' }),
  row({ condition_check_time: '01:00' }),
  row({ condition_check_time: '03:05' }),
  row({ condition_check_time: '04:05' }),
];

assert.equal(filterAsianCronRows(threeCronsPlus2110).length, 3);
assert.equal(allAsianCronsComplete(threeCronsPlus2110), false);
assert.equal(allCronsFiredToday(threeCronsPlus2110), false);

const allFourCronsPlus2110 = [
  ...threeCronsPlus2110,
  row({ condition_check_time: '04:10' }),
];

assert.equal(allAsianCronsComplete(allFourCronsPlus2110), true);
assert.equal(allCronsFiredToday(allFourCronsPlus2110), true);

const only0410NoDetection = [
  row({ condition_check_time: '21:10', action: 'D1_FALLBACK_SKIPPED_WEAK_D1' }),
  row({ condition_check_time: '04:10', action: 'NO_DETECTION' }),
];

assert.equal(allCronsFiredToday(only0410NoDetection), true);

console.log('asianDetectionDisplayHelpers: all assertions passed');
