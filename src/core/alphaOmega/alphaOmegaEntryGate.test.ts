import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALPHAOMEGA_BLOCK_ALREADY_OPEN,
  ALPHAOMEGA_BLOCK_NO_CRACK,
  ALPHAOMEGA_BLOCK_SPEED_FLOOR,
  ENTRY_SPEED_FLOOR_MIN,
} from './alphaOmegaConstants.js';
import { evaluateAlphaOmegaEntryGate } from './alphaOmegaEntryGate.js';
import type { CrackEvent } from './alphaOmegaStreakTracker.js';

function crack(partial: Partial<CrackEvent> & Pick<CrackEvent, 'enterDirection'>): CrackEvent {
  return {
    brokenDirection: partial.enterDirection === 'LONG' ? 'SHORT' : 'LONG',
    enterDirection: partial.enterDirection,
    foundingLength: partial.foundingLength ?? 8,
    foundingSpeedMin: partial.foundingSpeedMin ?? 40,
  };
}

describe('evaluateAlphaOmegaEntryGate — speed floor ≤35 shadow', () => {
  it('enters when founding speed is strictly above floor', () => {
    const result = evaluateAlphaOmegaEntryGate({
      crackEvent: crack({ enterDirection: 'LONG', foundingSpeedMin: 35.1, foundingLength: 8 }),
      direction: 'LONG',
      hasOpenPosition: false,
    });
    assert.equal(result.enter, true);
    assert.equal(result.blockReason, null);
    assert.equal(result.shadowAdvisory, null);
  });

  it('blocks exactly at floor (35.0) with SPEEDFLOOR shadow', () => {
    const result = evaluateAlphaOmegaEntryGate({
      crackEvent: crack({ enterDirection: 'SHORT', foundingSpeedMin: 35, foundingLength: 8 }),
      direction: 'SHORT',
      hasOpenPosition: false,
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
    });
    assert.equal(result.enter, false);
    assert.equal(result.blockReason, ALPHAOMEGA_BLOCK_SPEED_FLOOR);
    assert.match(result.shadowAdvisory ?? '', /would_enter:LONG/);
    assert.equal(ENTRY_SPEED_FLOOR_MIN, 35);
  });

  it('does not shadow when already open (no would-enter noise)', () => {
    const result = evaluateAlphaOmegaEntryGate({
      crackEvent: crack({ enterDirection: 'LONG', foundingSpeedMin: 32 }),
      direction: 'LONG',
      hasOpenPosition: true,
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
    });
    assert.equal(result.enter, false);
    assert.equal(result.blockReason, ALPHAOMEGA_BLOCK_NO_CRACK);
    assert.equal(result.shadowAdvisory, null);
  });
});
