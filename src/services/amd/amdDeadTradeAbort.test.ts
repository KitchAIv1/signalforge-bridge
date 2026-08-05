/**
 * Unit tests: engine_amd dead-trade abort decision logic.
 * Pure function, no I/O — mirrors alphaOmegaDeadCrackAbort.test.ts convention.
 * Thresholds must stay in parity with the validating replay
 * (scripts/amdDeadTradeAbortGrid.ts): hold >= 60m AND MFE < 4p -> abort.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  amdPeakGainPips,
  evaluateAmdDeadTradeAbort,
  formatAmdDeadTradeAdvisory,
} from './amdDeadTradeAbort.js';

const FILL = 0.65;
const CREATED_AT = '2026-08-04T11:00:00.000Z';

function minutesAfterEntry(minutes: number): number {
  return Date.parse(CREATED_AT) + minutes * 60_000;
}

function abortInput(
  overrides: Partial<Parameters<typeof evaluateAmdDeadTradeAbort>[0]> = {},
) {
  return {
    direction: 'long' as const,
    fillPrice: FILL,
    peakFavorablePrice: FILL,
    createdAt: CREATED_AT,
    asOfMs: minutesAfterEntry(90),
    ...overrides,
  };
}

function assertClose(actual: number, expected: number): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `expected ~${expected}, got ${actual}`,
  );
}

describe('amdPeakGainPips', () => {
  it('measures long peak gain from fill', () => {
    assertClose(amdPeakGainPips('long', FILL, FILL + 0.0005), 5);
  });

  it('measures short peak gain from fill (favorable = price below fill)', () => {
    assertClose(amdPeakGainPips('short', FILL, FILL - 0.0004), 4);
  });
});

describe('evaluateAmdDeadTradeAbort', () => {
  it('does not abort before 60 minutes even with zero MFE', () => {
    const result = evaluateAmdDeadTradeAbort(
      abortInput({ asOfMs: minutesAfterEntry(59.9) }),
    );
    assert.equal(result.shouldAbort, false);
    assert.equal(result.abortReason, null);
  });

  it('aborts at >= 60 minutes when MFE < 4 pips', () => {
    const result = evaluateAmdDeadTradeAbort(
      abortInput({ peakFavorablePrice: FILL + 0.00039, asOfMs: minutesAfterEntry(60) }),
    );
    assert.equal(result.shouldAbort, true);
    assert.equal(result.abortReason, 'dead_trade_abort');
    assert.ok(Math.abs(result.peakGainPips - 3.9) < 1e-9);
  });

  it('does not abort when MFE is clearly above the 4-pip arm (alive trade)', () => {
    // 4.1p, not exactly 4.0 — float division of 5-decimal prices makes exact
    // boundary equality unobservable in production; margins are the contract.
    const result = evaluateAmdDeadTradeAbort(
      abortInput({ peakFavorablePrice: FILL + 0.00041 }),
    );
    assert.equal(result.shouldAbort, false);
  });

  it('does not abort a trade with strong MFE regardless of hold', () => {
    const result = evaluateAmdDeadTradeAbort(
      abortInput({ peakFavorablePrice: FILL + 0.001, asOfMs: minutesAfterEntry(300) }),
    );
    assert.equal(result.shouldAbort, false);
  });

  it('handles shorts: peak below fill is favorable', () => {
    const dead = evaluateAmdDeadTradeAbort(
      abortInput({ direction: 'short', peakFavorablePrice: FILL - 0.0002 }),
    );
    assert.equal(dead.shouldAbort, true);
    const alive = evaluateAmdDeadTradeAbort(
      abortInput({ direction: 'short', peakFavorablePrice: FILL - 0.0006 }),
    );
    assert.equal(alive.shouldAbort, false);
  });

  it('treats an adverse-only path (peak never above fill) as dead after 60m', () => {
    const result = evaluateAmdDeadTradeAbort(abortInput());
    assert.equal(result.peakGainPips, 0);
    assert.equal(result.shouldAbort, true);
  });
});

describe('formatAmdDeadTradeAdvisory', () => {
  it('formats a compact forensics line', () => {
    const result = evaluateAmdDeadTradeAbort(
      abortInput({ peakFavorablePrice: FILL + 0.00013 }),
    );
    assert.equal(
      formatAmdDeadTradeAdvisory(result, 'would_abort'),
      'AMD_DEAD_TRADE:would_abort:hold=90m:mfe=1.3p',
    );
  });
});
