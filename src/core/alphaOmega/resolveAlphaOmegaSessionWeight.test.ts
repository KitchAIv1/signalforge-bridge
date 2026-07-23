/**
 * Unit tests: AO Asian session post-cap scale (21:00–08:00 UTC → 0.10/engineWeight).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALPHAOMEGA_ASIAN_SESSION_WEIGHT, ALPHAOMEGA_PURE_MAX_ABS_UNITS } from './alphaOmegaConstants.js';
import {
  applyAsiaPostCapUnitScale,
  sizeAlphaOmegaPureUnits,
  withPureSizingAdvisory,
} from './alphaOmegaPureSizer.js';
import {
  isAlphaOmegaAsianSessionUtc,
  resolveAlphaOmegaAsiaPostCapScale,
} from './resolveAlphaOmegaSessionWeight.js';

const ENGINE_WEIGHT = 0.25;
const ASIA_AS_OF = new Date('2026-07-14T02:00:00.000Z');
const NON_ASIA_AS_OF = new Date('2026-07-14T12:00:00.000Z');

function utc(iso: string): Date {
  return new Date(iso);
}

describe('isAlphaOmegaAsianSessionUtc', () => {
  it('marks 21:00 and 07:59 as Asia; 20:59 and 08:00 as not', () => {
    assert.equal(isAlphaOmegaAsianSessionUtc(utc('2026-07-13T20:59:00.000Z')), false);
    assert.equal(isAlphaOmegaAsianSessionUtc(utc('2026-07-13T21:00:00.000Z')), true);
    assert.equal(isAlphaOmegaAsianSessionUtc(utc('2026-07-14T07:59:00.000Z')), true);
    assert.equal(isAlphaOmegaAsianSessionUtc(utc('2026-07-14T08:00:00.000Z')), false);
  });

  it('marks mid-Asia and midday correctly', () => {
    assert.equal(isAlphaOmegaAsianSessionUtc(utc('2026-07-14T02:00:00.000Z')), true);
    assert.equal(isAlphaOmegaAsianSessionUtc(utc('2026-07-14T12:00:00.000Z')), false);
  });
});

describe('resolveAlphaOmegaAsiaPostCapScale', () => {
  it('returns 0.10/engineWeight in Asia and 1 outside', () => {
    assert.equal(
      resolveAlphaOmegaAsiaPostCapScale(ENGINE_WEIGHT, utc('2026-07-13T21:00:00.000Z')),
      ALPHAOMEGA_ASIAN_SESSION_WEIGHT / ENGINE_WEIGHT,
    );
    assert.equal(resolveAlphaOmegaAsiaPostCapScale(ENGINE_WEIGHT, NON_ASIA_AS_OF), 1);
  });

  it('returns 1 for non-positive engine weight', () => {
    assert.equal(resolveAlphaOmegaAsiaPostCapScale(0, ASIA_AS_OF), 1);
    assert.equal(resolveAlphaOmegaAsiaPostCapScale(-0.25, ASIA_AS_OF), 1);
  });
});

describe('applyAsiaPostCapUnitScale', () => {
  it('scales and rounds while preserving sign', () => {
    assert.equal(applyAsiaPostCapUnitScale(3_000_000, 0.4), 1_200_000);
    assert.equal(applyAsiaPostCapUnitScale(-3_000_000, 0.4), -1_200_000);
    assert.equal(applyAsiaPostCapUnitScale(2_500_000, 1), 2_500_000);
  });
});

describe('sizeAlphaOmegaPureUnits Asia post-cap', () => {
  const base = {
    routeEquity: 100_000,
    engineWeight: ENGINE_WEIGHT,
    riskPct: 0.03,
    entry: 0.7,
    stopLoss: 0.699,
    instrument: 'AUD_USD',
    direction: 'LONG' as const,
    capitalAllocationPct: 1,
  };

  it('Asia units are ~0.40× non-Asia at the same equity/SL (under cap)', () => {
    const nonAsia = sizeAlphaOmegaPureUnits({ ...base, asOf: NON_ASIA_AS_OF });
    const asia = sizeAlphaOmegaPureUnits({ ...base, asOf: ASIA_AS_OF });
    assert.ok(nonAsia > 0 && asia > 0);
    const ratio = asia / nonAsia;
    assert.ok(Math.abs(ratio - 0.4) < 0.001, `expected ~0.40 ratio, got ${ratio}`);
  });

  it('tiny SL Asia still shrinks after 3M cap (1.2M not 3M)', () => {
    const tiny = {
      routeEquity: 97961,
      engineWeight: ENGINE_WEIGHT,
      riskPct: 0.03,
      entry: 0.69762,
      stopLoss: 0.69775,
      instrument: 'AUD_USD',
      direction: 'SHORT' as const,
      capitalAllocationPct: 1,
      slPipsOverride: 1.3,
    };
    const nonAsia = sizeAlphaOmegaPureUnits({ ...tiny, asOf: NON_ASIA_AS_OF });
    const asia = sizeAlphaOmegaPureUnits({ ...tiny, asOf: ASIA_AS_OF });
    assert.equal(nonAsia, -ALPHAOMEGA_PURE_MAX_ABS_UNITS);
    assert.equal(asia, -Math.round(ALPHAOMEGA_PURE_MAX_ABS_UNITS * 0.4));
    assert.equal(asia, -1_200_000);
  });
});

describe('withPureSizingAdvisory Asia tag', () => {
  it('adds asiaW=0.10 in Asia and not outside', () => {
    const base = 'ALPHAOMEGA_ENTRY:len=7:speed=35.0m';
    const asia = withPureSizingAdvisory(base, utc('2026-07-13T23:26:00.000Z'));
    assert.equal(asia, `${base}:sizing=pure:asiaW=${ALPHAOMEGA_ASIAN_SESSION_WEIGHT}`);
    assert.equal(withPureSizingAdvisory(asia, utc('2026-07-13T23:26:00.000Z')), asia);

    const other = withPureSizingAdvisory(base, NON_ASIA_AS_OF);
    assert.equal(other, `${base}:sizing=pure`);
  });
});
