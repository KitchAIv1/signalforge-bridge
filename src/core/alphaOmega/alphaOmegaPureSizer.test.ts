/**
 * Unit tests: AO pure sizing isolates Lane B from AMD/confluence/graduated overlays.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateUnits } from '../positionSizer.js';
import {
  isAlphaOmegaEntryAdvisory,
  sizeAlphaOmegaPureUnits,
  withPureSizingAdvisory,
} from './alphaOmegaPureSizer.js';
import { ALPHAOMEGA_PURE_SIZING_NEUTRAL_CONFLUENCE } from './alphaOmegaConstants.js';

const BASE = {
  routeEquity: 96000,
  engineWeight: 0.15,
  riskPct: 0.03,
  entry: 0.69422,
  stopLoss: 0.69474,
  instrument: 'AUD_USD',
  capitalAllocationPct: 1,
};

describe('sizeAlphaOmegaPureUnits', () => {
  it('matches calculateUnits at neutral confluence with no graduated cut', () => {
    const expected = calculateUnits({
      equity: BASE.routeEquity,
      engineWeight: BASE.engineWeight,
      riskPct: BASE.riskPct,
      entry: BASE.entry,
      stopLoss: BASE.stopLoss,
      instrument: BASE.instrument,
      consecutiveLosses: 0,
      graduatedThreshold: Number.MAX_SAFE_INTEGER,
      confluenceScore: ALPHAOMEGA_PURE_SIZING_NEUTRAL_CONFLUENCE,
    });
    const pure = sizeAlphaOmegaPureUnits({ ...BASE, direction: 'SHORT' });
    assert.equal(pure, -expected);
  });

  it('ignores low confluence that would otherwise cut risk 15%', () => {
    const cut = calculateUnits({
      equity: BASE.routeEquity,
      engineWeight: BASE.engineWeight,
      riskPct: BASE.riskPct,
      entry: BASE.entry,
      stopLoss: BASE.stopLoss,
      instrument: BASE.instrument,
      consecutiveLosses: 0,
      graduatedThreshold: 3,
      confluenceScore: 6,
    });
    const pure = Math.abs(sizeAlphaOmegaPureUnits({ ...BASE, direction: 'SHORT' }));
    assert.ok(pure > cut);
    assert.ok(Math.abs(pure / cut - 1 / 0.85) < 0.02);
  });

  it('is larger than an AMD 0.25x inherited ticket at same equity/SL', () => {
    const full = Math.abs(sizeAlphaOmegaPureUnits({ ...BASE, direction: 'SHORT' }));
    const amdCut = Math.round(full * 0.25);
    assert.ok(full > amdCut * 3);
  });

  it('respects capital_allocation_pct', () => {
    const full = Math.abs(sizeAlphaOmegaPureUnits({ ...BASE, direction: 'LONG' }));
    const half = Math.abs(
      sizeAlphaOmegaPureUnits({ ...BASE, direction: 'LONG', capitalAllocationPct: 0.5 }),
    );
    assert.ok(Math.abs(half / full - 0.5) < 0.02);
  });
});

describe('AO pure sizing advisory helpers', () => {
  it('detects only ALPHAOMEGA_ENTRY advisories', () => {
    assert.equal(isAlphaOmegaEntryAdvisory('ALPHAOMEGA_ENTRY:len=7:speed=35.0m'), true);
    assert.equal(isAlphaOmegaEntryAdvisory('ALPHAOMEGA_DISABLED_FALLBACK'), false);
    assert.equal(isAlphaOmegaEntryAdvisory(null), false);
  });

  it('appends sizing=pure once', () => {
    const base = 'ALPHAOMEGA_ENTRY:len=7:speed=35.0m';
    const once = withPureSizingAdvisory(base);
    assert.equal(once, `${base}:sizing=pure`);
    assert.equal(withPureSizingAdvisory(once), once);
  });
});
