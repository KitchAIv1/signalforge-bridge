import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isFreshPdlDetection } from './pdlDetectionFreshness.js';

describe('isFreshPdlDetection', () => {
  it('rejects missing or pre-noon evaluated_at', () => {
    assert.equal(isFreshPdlDetection('2026-07-30', null), false);
    assert.equal(
      isFreshPdlDetection('2026-07-30', '2026-07-30T11:59:59.000Z'),
      false,
    );
  });

  it('accepts evaluated_at at or after 12:00 UTC', () => {
    assert.equal(
      isFreshPdlDetection('2026-07-30', '2026-07-30T12:00:00.000Z'),
      true,
    );
    assert.equal(
      isFreshPdlDetection('2026-07-30', '2026-07-30T12:01:00.473Z'),
      true,
    );
  });
});