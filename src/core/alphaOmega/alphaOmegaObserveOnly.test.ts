/**
 * Observe-only exec-dedup marker recognition (no Trail path).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALPHAOMEGA_OBSERVE_ONLY_EXECUTION_TIER } from './alphaOmegaConstants.js';
import {
  isAoObserveOnlyPayload,
  readSignalExecutionTier,
} from './alphaOmegaObserveOnly.js';

describe('isAoObserveOnlyPayload', () => {
  it('true for omega + ao_observe tier', () => {
    assert.equal(
      isAoObserveOnlyPayload({
        engine_id: 'omega',
        execution_tier: ALPHAOMEGA_OBSERVE_ONLY_EXECUTION_TIER,
        direction: 'short',
      }),
      true,
    );
  });

  it('false for omega + full tier (normal Trail path)', () => {
    assert.equal(
      isAoObserveOnlyPayload({
        engine_id: 'omega',
        execution_tier: 'full',
        direction: 'long',
      }),
      false,
    );
  });

  it('false for omega with missing tier', () => {
    assert.equal(
      isAoObserveOnlyPayload({ engine_id: 'omega', direction: 'long' }),
      false,
    );
  });

  it('false for non-omega even with ao_observe tier', () => {
    assert.equal(
      isAoObserveOnlyPayload({
        engine_id: 'rebuild',
        execution_tier: ALPHAOMEGA_OBSERVE_ONLY_EXECUTION_TIER,
      }),
      false,
    );
  });

  it('tier read is case-insensitive', () => {
    assert.equal(readSignalExecutionTier({ execution_tier: 'AO_OBSERVE' }), 'ao_observe');
    assert.equal(
      isAoObserveOnlyPayload({
        engine_id: 'omega',
        execution_tier: 'AO_OBSERVE',
      }),
      true,
    );
  });
});
