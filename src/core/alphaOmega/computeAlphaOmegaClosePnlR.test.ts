import { describe, expect, it } from 'vitest';
import { computeAlphaOmegaClosePnlR } from './computeAlphaOmegaClosePnlR.js';

describe('computeAlphaOmegaClosePnlR', () => {
  it('uses dollar / risk when stop and units exist', () => {
    const pnlR = computeAlphaOmegaClosePnlR({
      exitPrice: 1.1,
      fillPrice: 1.101,
      direction: 'LONG',
      rSizeRaw: 0.001,
      pnlPips: -10,
      pnlDollars: -50,
      stopLoss: 1.1,
      units: 50000,
    });
    // risk = 0.001 * 50000 = 50 → -50/50 = -1R
    expect(pnlR).toBe(-1);
  });

  it('falls back to pips / hard stop for negative AO exits', () => {
    const pnlR = computeAlphaOmegaClosePnlR({
      exitPrice: null,
      fillPrice: null,
      direction: 'SHORT',
      rSizeRaw: null,
      pnlPips: -8.4,
      pnlDollars: -42,
      stopLoss: null,
      units: null,
    });
    expect(pnlR).toBe(-0.84);
  });

  it('does not coerce negative R to zero', () => {
    const pnlR = computeAlphaOmegaClosePnlR({
      exitPrice: 1.102,
      fillPrice: 1.1,
      direction: 'SHORT',
      rSizeRaw: 0.001,
      pnlPips: -20,
      pnlDollars: null,
      stopLoss: null,
      units: null,
    });
    // SHORT: fill - exit = 1.1 - 1.102 = -0.002 / 0.001 = -2R
    expect(pnlR).toBe(-2);
  });
});
