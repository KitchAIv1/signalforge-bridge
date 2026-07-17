/**
 * Unit tests: AO Lane B peak-favorable-giveback trail decision logic.
 * Pure function, no I/O — mirrors alphaOmegaPureSizer.test.ts convention.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LatestM5Candle } from '../../connectors/oanda.js';
import { evaluateGivebackTrail } from './alphaOmegaGivebackTrail.js';

function candle(high: number, low: number): LatestM5Candle {
  return { high, low, close: (high + low) / 2, time: '2026-07-17T00:00:00.000Z' };
}

const ENTRY = 0.7;

describe('evaluateGivebackTrail', () => {
  it('does not exit below the activation threshold even with a large retracement', () => {
    // peak only 4p (below 6p activation), retraces fully back to entry — must not exit.
    const result = evaluateGivebackTrail(
      { direction: 'LONG', entryPrice: ENTRY, peakFavorablePips: 4 },
      candle(0.7, 0.7),
    );
    assert.equal(result.shouldExit, false);
    assert.equal(result.exitReason, null);
  });

  it('advances the peak when a new favorable high is set (no retracement yet)', () => {
    const result = evaluateGivebackTrail(
      { direction: 'LONG', entryPrice: ENTRY, peakFavorablePips: 3 },
      candle(0.7008, 0.7005), // +8p high
    );
    assert.equal(result.shouldExit, false);
    assert.ok(Math.abs(result.nextPeakFavorablePips - 8) < 1e-6, `expected ~8, got ${result.nextPeakFavorablePips}`);
  });

  it('exits LONG once retracement from peak clears the giveback threshold', () => {
    // peak 8p (armed), this candle's low is entry+4.8p => retracement = 8-4.8 = 3.2p (> 3p threshold)
    const result = evaluateGivebackTrail(
      { direction: 'LONG', entryPrice: ENTRY, peakFavorablePips: 8 },
      candle(0.7008, 0.70048),
    );
    assert.equal(result.shouldExit, true);
    assert.equal(result.exitReason, 'alphaomega_peak_giveback_trail');
  });

  it('does not exit LONG when retracement is clearly under the threshold', () => {
    // peak 8p, candle low = entry+5.2p => retracement = 2.8p (< 3p threshold)
    const result = evaluateGivebackTrail(
      { direction: 'LONG', entryPrice: ENTRY, peakFavorablePips: 8 },
      candle(0.7008, 0.70052),
    );
    assert.equal(result.shouldExit, false);
  });

  it('is symmetric for SHORT (favorable = price falling, adverse = price rising)', () => {
    const shortEntry = 0.7;
    // peak 8p favorable => price at 0.6992. Candle high retraces to 0.6996 => retracement = 8 - 4 = 4p (> 3p threshold)
    const result = evaluateGivebackTrail(
      { direction: 'SHORT', entryPrice: shortEntry, peakFavorablePips: 8 },
      candle(0.6996, 0.6992),
    );
    assert.equal(result.shouldExit, true);
  });

  it('never decreases the tracked peak, even on a triggering exit candle', () => {
    // peak already 10p; this candle's low (0.6999, -1p vs entry) triggers the exit —
    // the reported peak must stay 10, not drop to this candle's own smaller high.
    const result = evaluateGivebackTrail(
      { direction: 'LONG', entryPrice: ENTRY, peakFavorablePips: 10 },
      candle(0.7002, 0.6999),
    );
    assert.equal(result.shouldExit, true);
    assert.equal(result.nextPeakFavorablePips, 10);
  });
});
