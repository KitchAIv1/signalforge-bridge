/**
 * Omega execution_tier whitelist — unknown must not fall through to full path.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALPHAOMEGA_OBSERVE_ONLY_EXECUTION_TIER,
  ALPHAOMEGA_SHADOW_OVER_EXECUTION_TIER,
} from './alphaOmegaConstants.js';
import {
  classifyOmegaExecutionTier,
  isAoObserveOnlyPayload,
  isAoShadowOverPayload,
  isUnknownOmegaExecutionTier,
} from './alphaOmegaExecutionTier.js';

describe('classifyOmegaExecutionTier', () => {
  it('ao_observe → ao_observe', () => {
    assert.equal(
      classifyOmegaExecutionTier({
        engine_id: 'omega',
        execution_tier: ALPHAOMEGA_OBSERVE_ONLY_EXECUTION_TIER,
      }),
      'ao_observe',
    );
    assert.equal(
      isAoObserveOnlyPayload({
        engine_id: 'omega',
        execution_tier: 'AO_OBSERVE',
      }),
      true,
    );
  });

  it('ao_shadow_over → ao_shadow_over', () => {
    assert.equal(
      classifyOmegaExecutionTier({
        engine_id: 'omega',
        execution_tier: ALPHAOMEGA_SHADOW_OVER_EXECUTION_TIER,
      }),
      'ao_shadow_over',
    );
    assert.equal(
      isAoShadowOverPayload({
        engine_id: 'omega',
        execution_tier: ALPHAOMEGA_SHADOW_OVER_EXECUTION_TIER,
      }),
      true,
    );
  });

  it('full and missing tier keep full_path (legacy)', () => {
    assert.equal(
      classifyOmegaExecutionTier({ engine_id: 'omega', execution_tier: 'full' }),
      'full_path',
    );
    assert.equal(
      classifyOmegaExecutionTier({ engine_id: 'omega' }),
      'full_path',
    );
  });

  it('unknown tier is blocked from full_path', () => {
    assert.equal(
      classifyOmegaExecutionTier({
        engine_id: 'omega',
        execution_tier: 'paper_shadow',
      }),
      'unknown_tier',
    );
    assert.equal(
      isUnknownOmegaExecutionTier({
        engine_id: 'omega',
        execution_tier: 'ao-observe',
      }),
      true,
    );
  });

  it('non-omega ignores tier', () => {
    assert.equal(
      classifyOmegaExecutionTier({
        engine_id: 'rebuild',
        execution_tier: 'weird',
      }),
      'full_path',
    );
  });
});
