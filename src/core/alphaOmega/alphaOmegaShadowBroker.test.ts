import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isOmegaAoShadowBroker,
  isShadowPaperTradeId,
  OMEGA_AO_SHADOW_BROKER_ID,
} from './alphaOmegaConstants.js';

describe('shadow paper identity guards', () => {
  it('detects ao_shadow_paper broker', () => {
    assert.equal(isOmegaAoShadowBroker(OMEGA_AO_SHADOW_BROKER_ID), true);
    assert.equal(isOmegaAoShadowBroker('oanda_practice'), false);
    assert.equal(isOmegaAoShadowBroker(null), false);
  });

  it('detects shadow-* trade ids', () => {
    assert.equal(isShadowPaperTradeId('shadow-dcfee3a8-c6e0-4b79-9524-6f079dfda6d1'), true);
    assert.equal(isShadowPaperTradeId('11049'), false);
    assert.equal(isShadowPaperTradeId(null), false);
  });
});
