import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildD1BarsFromM5 } from './peakFadeD1.js';
import { evaluatePeakFadeSetup } from './peakFadeStrategy.js';
import { loadPeakFadeConfig } from './peakFadeTypes.js';

describe('evaluatePeakFadeSetup', () => {
  it('fires short near prior D1 high after upward push', () => {
    const bars = [];
    // Day 1: high 1.1000
    for (let i = 0; i < 3; i += 1) {
      bars.push({
        timeMs: Date.parse('2026-08-10T10:00:00.000Z') + i * 5 * 60_000,
        open: 1.098,
        high: 1.1,
        low: 1.097,
        close: 1.099,
      });
    }
    // Day 2 push into high
    const base = Date.parse('2026-08-11T10:00:00.000Z');
    for (let i = 0; i < 8; i += 1) {
      const close = 1.0985 + i * 0.00015;
      bars.push({
        timeMs: base + i * 5 * 60_000,
        open: close - 0.00005,
        high: close + 0.00005,
        low: close - 0.0001,
        close,
      });
    }
    const cfg = {
      ...loadPeakFadeConfig(),
      nearExtremePips: 10,
      trendBars: 6,
      minTrendProgressPips: 3,
      targetPips: 9,
    };
    const setup = evaluatePeakFadeSetup(bars, buildD1BarsFromM5(bars), cfg);
    assert.ok(setup);
    assert.equal(setup!.direction, 'short');
    assert.equal(setup!.refDayKey, '2026-08-10');
  });
});
