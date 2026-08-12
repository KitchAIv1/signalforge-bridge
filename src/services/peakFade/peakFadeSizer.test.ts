import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sizePeakFadeUnits } from './peakFadeSizer.js';

describe('sizePeakFadeUnits', () => {
  it('grows with equity', () => {
    const small = sizePeakFadeUnits({
      equity: 1_000,
      engineWeight: 0.1,
      riskPct: 1,
      riskRefPips: 20,
    });
    const large = sizePeakFadeUnits({
      equity: 10_000,
      engineWeight: 0.1,
      riskPct: 1,
      riskRefPips: 20,
    });
    assert.ok(large > small);
    assert.ok(small >= 1000);
  });
});
