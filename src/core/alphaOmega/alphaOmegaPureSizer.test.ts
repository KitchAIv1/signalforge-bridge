/**
 * Unit tests: AO pure sizing isolates Lane B from AMD/confluence/graduated overlays.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateUnits } from '../positionSizer.js';
import {
  clampAlphaOmegaPureUnits,
  isAlphaOmegaEntryAdvisory,
  sizeAlphaOmegaPureUnits,
  withPureSizingAdvisory,
} from './alphaOmegaPureSizer.js';
import {
  ALPHAOMEGA_PURE_MAX_ABS_UNITS,
  ALPHAOMEGA_PURE_SIZING_NEUTRAL_CONFLUENCE,
} from './alphaOmegaConstants.js';

/** Fixed non-Asia UTC so session weight 0.10 cannot flake unit tests. */
const NON_ASIA_AS_OF = new Date('2026-07-14T12:00:00.000Z');

const BASE = {
  routeEquity: 96000,
  engineWeight: 0.15,
  riskPct: 0.03,
  entry: 0.69422,
  stopLoss: 0.69474,
  instrument: 'AUD_USD',
  capitalAllocationPct: 1,
  asOf: NON_ASIA_AS_OF,
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

  it('caps abs units at ALPHAOMEGA_PURE_MAX_ABS_UNITS (tonight-style tiny SL)', () => {
    // ~1.3p SL @ weight 0.25 / ~98k equity uncapped ~5.6M → must clamp
    const capped = sizeAlphaOmegaPureUnits({
      routeEquity: 97961,
      engineWeight: 0.25,
      riskPct: 0.03,
      entry: 0.69762,
      stopLoss: 0.69775,
      instrument: 'AUD_USD',
      direction: 'SHORT',
      capitalAllocationPct: 1,
      slPipsOverride: 1.3,
      asOf: NON_ASIA_AS_OF,
    });
    assert.equal(capped, -ALPHAOMEGA_PURE_MAX_ABS_UNITS);
  });
});

describe('clampAlphaOmegaPureUnits', () => {
  it('leaves units under the cap unchanged', () => {
    assert.equal(clampAlphaOmegaPureUnits(2_500_000), 2_500_000);
    assert.equal(clampAlphaOmegaPureUnits(-2_500_000), -2_500_000);
  });

  it('clamps above the cap and keeps sign', () => {
    assert.equal(clampAlphaOmegaPureUnits(5_651_613), ALPHAOMEGA_PURE_MAX_ABS_UNITS);
    assert.equal(clampAlphaOmegaPureUnits(-5_651_613), -ALPHAOMEGA_PURE_MAX_ABS_UNITS);
  });
});

describe('AO pure sizing advisory helpers', () => {
  it('detects only ALPHAOMEGA_ENTRY advisories', () => {
    assert.equal(isAlphaOmegaEntryAdvisory('ALPHAOMEGA_ENTRY:len=7:speed=35.0m'), true);
    assert.equal(isAlphaOmegaEntryAdvisory('ALPHAOMEGA_DISABLED_FALLBACK'), false);
    assert.equal(isAlphaOmegaEntryAdvisory(null), false);
  });

  it('appends sizing=pure once (non-Asia)', () => {
    const base = 'ALPHAOMEGA_ENTRY:len=7:speed=35.0m';
    const once = withPureSizingAdvisory(base, NON_ASIA_AS_OF);
    assert.equal(once, `${base}:sizing=pure`);
    assert.equal(withPureSizingAdvisory(once, NON_ASIA_AS_OF), once);
  });
});
