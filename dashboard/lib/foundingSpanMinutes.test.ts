import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { foundingSpanMinutes } from './foundingSpanMinutes';

describe('foundingSpanMinutes', () => {
  it('measures start→last fire (not now→start)', () => {
    const start = '2026-07-20T00:56:00.000Z';
    const last = '2026-07-20T01:11:00.000Z';
    assert.equal(foundingSpanMinutes(start, last), 15);
  });

  it('returns null when either timestamp missing', () => {
    assert.equal(foundingSpanMinutes(null, '2026-07-20T01:11:00.000Z'), null);
    assert.equal(foundingSpanMinutes('2026-07-20T00:56:00.000Z', null), null);
  });
});
