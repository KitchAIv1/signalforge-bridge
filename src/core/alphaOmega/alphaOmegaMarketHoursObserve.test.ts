/**
 * Closed-session Omega ghosts must not be observed into AO streak state.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldObserveAlphaOmegaFire } from './alphaOmegaFireObserver.js';

describe('shouldObserveAlphaOmegaFire', () => {
  it('returns false on Saturday (UTC closed)', () => {
    // 2026-07-18T17:51:00Z = Sat afternoon EDT (ghost fire that armed LONG)
    assert.equal(shouldObserveAlphaOmegaFire(new Date('2026-07-18T17:51:00.000Z')), false);
  });

  it('returns false on Friday after close buffer (UTC)', () => {
    // Fri 21:40 UTC — within 30m buffer before 22:00 close
    assert.equal(shouldObserveAlphaOmegaFire(new Date('2026-07-17T21:40:00.000Z')), false);
  });

  it('returns true on Friday before close buffer (UTC)', () => {
    // Fri 21:00 UTC — still open with 30m buffer (close 22:00)
    assert.equal(shouldObserveAlphaOmegaFire(new Date('2026-07-17T21:00:00.000Z')), true);
  });

  it('returns false on Sunday before open (UTC)', () => {
    assert.equal(shouldObserveAlphaOmegaFire(new Date('2026-07-19T21:59:00.000Z')), false);
  });

  it('returns true on Sunday at open (UTC)', () => {
    assert.equal(shouldObserveAlphaOmegaFire(new Date('2026-07-19T22:00:00.000Z')), true);
  });

  it('returns true on a midweek session (UTC)', () => {
    assert.equal(shouldObserveAlphaOmegaFire(new Date('2026-07-15T15:00:00.000Z')), true);
  });
});
