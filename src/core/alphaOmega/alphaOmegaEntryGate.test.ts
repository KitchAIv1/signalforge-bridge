import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALPHAOMEGA_BLOCK_ALREADY_OPEN,
  ALPHAOMEGA_BLOCK_ENTRY_BLACKOUT,
  ALPHAOMEGA_BLOCK_NO_CRACK,
  ALPHAOMEGA_BLOCK_SPEED_FLOOR,
  ENTRY_SPEED_FLOOR_MIN,
  isAtOrBelowEntrySpeedFloor,
  roundAdvisorySpeedMin,
} from './alphaOmegaConstants.js';
import { evaluateAlphaOmegaEntryGate } from './alphaOmegaEntryGate.js';
import type { CrackEvent } from './alphaOmegaStreakTracker.js';

/** Mid-session UTC — outside [21:00, 21:15) blackout so speed-floor tests stay deterministic. */
const OUTSIDE_BLACKOUT = new Date('2026-07-15T15:00:00.000Z');

function crack(partial: Partial<CrackEvent> & Pick<CrackEvent, 'enterDirection'>): CrackEvent {
  return {
    brokenDirection: partial.enterDirection === 'LONG' ? 'SHORT' : 'LONG',
    enterDirection: partial.enterDirection,
    foundingLength: partial.foundingLength ?? 8,
    foundingSpeedMin: partial.foundingSpeedMin ?? 40,
  };
}

describe('roundAdvisorySpeedMin — 1-decimal advisory parity', () => {
  it('rounds raw minutes the same way lane_advisory writes speed=', () => {
    assert.equal(roundAdvisorySpeedMin(35.04), 35.0);
    assert.equal(roundAdvisorySpeedMin(34.96), 35.0);
    assert.equal(roundAdvisorySpeedMin(29.96), 30.0);
    assert.equal(roundAdvisorySpeedMin(35.1), 35.1);
  });

  it('floor check uses advisory rounding (35.04 blocked, 35.1 allowed)', () => {
    assert.equal(isAtOrBelowEntrySpeedFloor(35.04), true);
    assert.equal(isAtOrBelowEntrySpeedFloor(35.0), true);
    assert.equal(isAtOrBelowEntrySpeedFloor(35.1), false);
    assert.equal(ENTRY_SPEED_FLOOR_MIN, 35);
  });
});

describe('evaluateAlphaOmegaEntryGate — speed floor ≤35 shadow', () => {
  it('enters when advisory-rounded speed is strictly above floor', () => {
    const result = evaluateAlphaOmegaEntryGate({
      crackEvent: crack({ enterDirection: 'LONG', foundingSpeedMin: 35.1, foundingLength: 8 }),
      direction: 'LONG',
      hasOpenPosition: false,
      asOf: OUTSIDE_BLACKOUT,
    });
    assert.equal(result.enter, true);
    assert.equal(result.blockReason, null);
    assert.equal(result.shadowAdvisory, null);
  });

  it('blocks raw 35.04 (advisory 35.0) that would have slipped past raw <=35', () => {
    const result = evaluateAlphaOmegaEntryGate({
      crackEvent: crack({ enterDirection: 'LONG', foundingSpeedMin: 35.04, foundingLength: 8 }),
      direction: 'LONG',
      hasOpenPosition: false,
      asOf: OUTSIDE_BLACKOUT,
    });
    assert.equal(result.enter, false);
    assert.equal(result.blockReason, ALPHAOMEGA_BLOCK_SPEED_FLOOR);
    assert.match(result.shadowAdvisory ?? '', /speed=35\.0m/);
  });

  it('blocks exactly at floor (35.0) with SPEEDFLOOR shadow', () => {
    const result = evaluateAlphaOmegaEntryGate({
      crackEvent: crack({ enterDirection: 'SHORT', foundingSpeedMin: 35, foundingLength: 8 }),
      direction: 'SHORT',
      hasOpenPosition: false,
      asOf: OUTSIDE_BLACKOUT,
    });
    assert.equal(result.enter, false);
    assert.equal(result.blockReason, ALPHAOMEGA_BLOCK_SPEED_FLOOR);
    assert.match(result.shadowAdvisory ?? '', /^ALPHAOMEGA_SPEEDFLOOR_SHADOW:would_enter:SHORT/);
    assert.match(result.shadowAdvisory ?? '', /speed=35\.0m/);
    assert.match(result.shadowAdvisory ?? '', /len=8/);
  });

  it('blocks floor-band 30m with SPEEDFLOOR shadow', () => {
    const result = evaluateAlphaOmegaEntryGate({
      crackEvent: crack({ enterDirection: 'LONG', foundingSpeedMin: 30, foundingLength: 7 }),
      direction: 'LONG',
      hasOpenPosition: false,
      asOf: OUTSIDE_BLACKOUT,
    });
    assert.equal(result.enter, false);
    assert.equal(result.blockReason, ALPHAOMEGA_BLOCK_SPEED_FLOOR);
    assert.match(result.shadowAdvisory ?? '', /would_enter:LONG/);
  });

  it('does not shadow when already open (no would-enter noise)', () => {
    const result = evaluateAlphaOmegaEntryGate({
      crackEvent: crack({ enterDirection: 'LONG', foundingSpeedMin: 32 }),
      direction: 'LONG',
      hasOpenPosition: true,
      asOf: OUTSIDE_BLACKOUT,
    });
    assert.equal(result.enter, false);
    assert.equal(result.blockReason, ALPHAOMEGA_BLOCK_ALREADY_OPEN);
    assert.equal(result.shadowAdvisory, null);
  });

  it('blocks no-crack without shadow', () => {
    const result = evaluateAlphaOmegaEntryGate({
      crackEvent: null,
      direction: 'LONG',
      hasOpenPosition: false,
      asOf: OUTSIDE_BLACKOUT,
    });
    assert.equal(result.enter, false);
    assert.equal(result.blockReason, ALPHAOMEGA_BLOCK_NO_CRACK);
    assert.equal(result.shadowAdvisory, null);
  });
});

describe('evaluateAlphaOmegaEntryGate — Asia-open entry blackout', () => {
  it('blocks qualifying crack during [21:00, 21:15) before speed floor', () => {
    const result = evaluateAlphaOmegaEntryGate({
      crackEvent: crack({ enterDirection: 'LONG', foundingSpeedMin: 40, foundingLength: 8 }),
      direction: 'LONG',
      hasOpenPosition: false,
      asOf: new Date('2026-07-27T21:06:00.000Z'),
    });
    assert.equal(result.enter, false);
    assert.equal(result.blockReason, ALPHAOMEGA_BLOCK_ENTRY_BLACKOUT);
    assert.equal(result.shadowAdvisory, null);
    assert.equal(result.foundingLength, 8);
  });

  it('allows same crack at 21:15 UTC', () => {
    const result = evaluateAlphaOmegaEntryGate({
      crackEvent: crack({ enterDirection: 'LONG', foundingSpeedMin: 40, foundingLength: 8 }),
      direction: 'LONG',
      hasOpenPosition: false,
      asOf: new Date('2026-07-27T21:15:00.000Z'),
    });
    assert.equal(result.enter, true);
    assert.equal(result.blockReason, null);
  });

  it('prefers already-open over blackout', () => {
    const result = evaluateAlphaOmegaEntryGate({
      crackEvent: crack({ enterDirection: 'LONG', foundingSpeedMin: 40 }),
      direction: 'LONG',
      hasOpenPosition: true,
      asOf: new Date('2026-07-27T21:06:00.000Z'),
    });
    assert.equal(result.blockReason, ALPHAOMEGA_BLOCK_ALREADY_OPEN);
  });
});
