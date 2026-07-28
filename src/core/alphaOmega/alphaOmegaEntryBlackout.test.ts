import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAlphaOmegaEntryBlackoutUtc } from './alphaOmegaEntryBlackout.js';

describe('isAlphaOmegaEntryBlackoutUtc', () => {
  it('allows just before 21:00 UTC', () => {
    assert.equal(isAlphaOmegaEntryBlackoutUtc(new Date('2026-07-27T20:59:59.000Z')), false);
  });

  it('blocks at 21:00:00 UTC', () => {
    assert.equal(isAlphaOmegaEntryBlackoutUtc(new Date('2026-07-27T21:00:00.000Z')), true);
  });

  it('blocks mid-window 21:06 UTC (Asia reopen blowout band)', () => {
    assert.equal(isAlphaOmegaEntryBlackoutUtc(new Date('2026-07-27T21:06:00.000Z')), true);
  });

  it('blocks at 21:14:59 UTC', () => {
    assert.equal(isAlphaOmegaEntryBlackoutUtc(new Date('2026-07-27T21:14:59.000Z')), true);
  });

  it('allows at 21:15:00 UTC (exclusive end)', () => {
    assert.equal(isAlphaOmegaEntryBlackoutUtc(new Date('2026-07-27T21:15:00.000Z')), false);
  });

  it('applies on Sunday and midweek the same', () => {
    assert.equal(isAlphaOmegaEntryBlackoutUtc(new Date('2026-07-26T21:05:00.000Z')), true); // Sunday
    assert.equal(isAlphaOmegaEntryBlackoutUtc(new Date('2026-07-28T21:05:00.000Z')), true); // Tuesday
  });
});
