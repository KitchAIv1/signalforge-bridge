/**
 * Unit tests: RAW Omega pure sizing ignores AMD/news/confluence/graduated overlays.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateUnits } from '../positionSizer.js';
import { sizeOmegaRawPureUnits } from './omegaRawPureSizer.js';
import { OMEGA_RAW_PURE_SIZING_NEUTRAL_CONFLUENCE } from './omegaRawConstants.js';

const BASE = {
  equity: 100000,
  engineWeight: 0.15,
  riskPct: 0.03,
  entry: 0.69422,
  stopLoss: 0.69474,
  instrument: 'AUD_USD',
};

describe('sizeOmegaRawPureUnits', () => {
  it('matches calculateUnits at neutral confluence with no graduated cut', () => {
    const expected = calculateUnits({
      equity: BASE.equity,
      engineWeight: BASE.engineWeight,
      riskPct: BASE.riskPct,
      entry: BASE.entry,
      stopLoss: BASE.stopLoss,
      instrument: BASE.instrument,
      consecutiveLosses: 0,
      graduatedThreshold: Number.MAX_SAFE_INTEGER,
      confluenceScore: OMEGA_RAW_PURE_SIZING_NEUTRAL_CONFLUENCE,
    });
    const pure = sizeOmegaRawPureUnits({ ...BASE, direction: 'SHORT' });
    assert.equal(pure, -expected);
  });

  it('ignores low confluence that would otherwise cut risk 15%', () => {
    const cut = calculateUnits({
      equity: BASE.equity,
      engineWeight: BASE.engineWeight,
      riskPct: BASE.riskPct,
      entry: BASE.entry,
      stopLoss: BASE.stopLoss,
      instrument: BASE.instrument,
      consecutiveLosses: 0,
      graduatedThreshold: 3,
      confluenceScore: 6,
    });
    const pure = Math.abs(sizeOmegaRawPureUnits({ ...BASE, direction: 'SHORT' }));
    assert.ok(pure > cut);
    assert.ok(Math.abs(pure / cut - 1 / 0.85) < 0.02);
  });

  it('is larger than an AMD 0.25x overlay ticket at same equity/SL', () => {
    const full = Math.abs(sizeOmegaRawPureUnits({ ...BASE, direction: 'SHORT' }));
    const amdCut = Math.round(full * 0.25);
    assert.ok(full > amdCut * 3);
  });

  it('respects capital_allocation_pct', () => {
    const full = Math.abs(sizeOmegaRawPureUnits({ ...BASE, direction: 'LONG' }));
    const half = Math.abs(
      sizeOmegaRawPureUnits({ ...BASE, direction: 'LONG', capitalAllocationPct: 0.5 }),
    );
    assert.ok(Math.abs(half / full - 0.5) < 0.02);
  });
});
