import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tpPriceFromFill } from './peakFadePlaceOrder.js';

describe('tpPriceFromFill', () => {
  it('offsets long/short by target pips', () => {
    assert.equal(tpPriceFromFill('long', 0.65, 9), 0.6509);
    assert.equal(tpPriceFromFill('short', 0.65, 9), 0.6491);
  });
});
