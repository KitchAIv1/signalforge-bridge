/**
 * Unit tests: AO Lane B dead-crack abort decision logic.
 * Pure function, no I/O — mirrors alphaOmegaGivebackTrail.test.ts convention.
 * Thresholds must stay in parity with scripts/aoRefuseTapeCf/walkLiveTradePath.ts
 * (30m hold, MFE < 1.5p, MAE >= 3p, fold-candle-then-check order).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LatestM5Candle } from '../../connectors/oanda.js';
import {
  adversePipsFromCandle,
  evaluateDeadCrackAbort,
  formatDeadCrackAdvisory,
} from './alphaOmegaDeadCrackAbort.js';

const ENTRY = 0.65;
const ENTRY_AT = '2026-08-03T12:00:00.000Z';

function candle(high: number, low: number): LatestM5Candle {
  return { high, low, close: (high + low) / 2, time: '2026-08-03T12:30:00.000Z' };
}

function minutesAfterEntry(minutes: number): number {
  return Date.parse(ENTRY_AT) + minutes * 60_000;
}

function deadInput(overrides: Partial<Parameters<typeof evaluateDeadCrackAbort>[0]> = {}) {
  return {
    direction: 'LONG' as const,
    entryPrice: ENTRY,
    entryFiredAt: ENTRY_AT,
    peakFavorablePips: 0,
    troughAdversePips: 4,
    asOfMs: minutesAfterEntry(35),
    ...overrides,
  };
}

describe('evaluateDeadCrackAbort', () => {
  it('never aborts before the 30-minute minimum hold, even when fully dead', () => {
    const result = evaluateDeadCrackAbort(
      deadInput({ asOfMs: minutesAfterEntry(20) }),
      candle(ENTRY, ENTRY - 0.0005), // 5p underwater right now
    );
    assert.equal(result.shouldAbort, false);
    assert.equal(result.abortReason, null);
  });

  it('aborts a dead trade: >=30m hold, MFE < 1.5p, MAE >= 3p', () => {
    const result = evaluateDeadCrackAbort(deadInput(), candle(ENTRY + 0.0001, ENTRY - 0.0004));
    assert.equal(result.shouldAbort, true);
    assert.equal(result.abortReason, 'alphaomega_dead_crack_abort');
  });

  it('protects a trade whose stored peak already cleared 1.5p (early follow-through)', () => {
    const result = evaluateDeadCrackAbort(
      deadInput({ peakFavorablePips: 2.5 }),
      candle(ENTRY, ENTRY - 0.0006),
    );
    assert.equal(result.shouldAbort, false);
  });

  it('protects when THIS candle pushes MFE past 1.5p (fold-then-check, CF parity)', () => {
    // Stored peak 1.2p (would abort), but the current candle's high reaches +1.6p.
    const result = evaluateDeadCrackAbort(
      deadInput({ peakFavorablePips: 1.2 }),
      candle(ENTRY + 0.00016, ENTRY - 0.0004),
    );
    assert.equal(result.shouldAbort, false);
    assert.ok(Math.abs(result.nextPeakFavorablePips - 1.6) < 1e-6);
  });

  it('counts THIS candle toward MAE (fold-then-check, CF parity)', () => {
    // Stored trough only 1p, but the current candle dips to -3.1p.
    const result = evaluateDeadCrackAbort(
      deadInput({ troughAdversePips: 1 }),
      candle(ENTRY + 0.00005, ENTRY - 0.00031),
    );
    assert.equal(result.shouldAbort, true);
    assert.ok(Math.abs(result.nextTroughAdversePips - 3.1) < 1e-6);
  });

  it('does not abort when drawdown never reached 3p (quiet flat trade)', () => {
    const result = evaluateDeadCrackAbort(
      deadInput({ troughAdversePips: 1.5 }),
      candle(ENTRY + 0.00005, ENTRY - 0.0002),
    );
    assert.equal(result.shouldAbort, false);
  });

  it('treats MFE boundary strictly: exactly 1.5p favorable is alive, not dead', () => {
    const result = evaluateDeadCrackAbort(
      deadInput({ peakFavorablePips: 1.5 }),
      candle(ENTRY, ENTRY - 0.0005),
    );
    assert.equal(result.shouldAbort, false);
  });

  it('handles SHORT direction (adverse = above entry, favorable = below)', () => {
    const shortCandle = candle(ENTRY + 0.0004, ENTRY - 0.00005); // 4p against a SHORT
    assert.ok(Math.abs(adversePipsFromCandle('SHORT', ENTRY, shortCandle) - 4) < 1e-6);
    const result = evaluateDeadCrackAbort(
      deadInput({ direction: 'SHORT', troughAdversePips: 0 }),
      shortCandle,
    );
    assert.equal(result.shouldAbort, true);
  });

  it('advances both extremes even when no abort fires (persist-either-way contract)', () => {
    const result = evaluateDeadCrackAbort(
      deadInput({ peakFavorablePips: 2, troughAdversePips: 1, asOfMs: minutesAfterEntry(10) }),
      candle(ENTRY + 0.0003, ENTRY - 0.0002),
    );
    assert.equal(result.shouldAbort, false);
    assert.ok(Math.abs(result.nextPeakFavorablePips - 3) < 1e-6);
    assert.ok(Math.abs(result.nextTroughAdversePips - 2) < 1e-6);
  });

  it('formats a compact forensics advisory', () => {
    const result = evaluateDeadCrackAbort(deadInput(), candle(ENTRY + 0.0001, ENTRY - 0.0004));
    assert.equal(
      formatDeadCrackAdvisory(result, 'would_abort'),
      'ALPHAOMEGA_DEAD_CRACK:would_abort:hold=35m:mfe=1.0p:mae=4.0p',
    );
  });
});
