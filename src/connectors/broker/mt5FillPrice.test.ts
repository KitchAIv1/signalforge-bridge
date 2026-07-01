import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchMt5OpenPriceWithRetry } from './mt5FillPrice.js';

describe('fetchMt5OpenPriceWithRetry', () => {
  it('returns openPrice on first successful call', async () => {
    const rpc = { getPosition: async () => ({ openPrice: 0.68945 }) };
    const price = await fetchMt5OpenPriceWithRetry(rpc, 'pos-1');
    assert.equal(price, 0.68945);
  });

  it('retries when the position is not yet visible, then succeeds', async () => {
    let calls = 0;
    const rpc = {
      getPosition: async () => {
        calls += 1;
        if (calls < 2) throw new Error('NotFoundError');
        return { openPrice: 0.69 };
      },
    };
    const price = await fetchMt5OpenPriceWithRetry(rpc, 'pos-1', 3, 1);
    assert.equal(price, 0.69);
    assert.equal(calls, 2);
  });

  it('returns null after exhausting all retries', async () => {
    const rpc = { getPosition: async () => { throw new Error('NotFoundError'); } };
    const price = await fetchMt5OpenPriceWithRetry(rpc, 'pos-1', 2, 1);
    assert.equal(price, null);
  });

  it('returns null when openPrice is missing or zero', async () => {
    const rpc = { getPosition: async () => ({ openPrice: 0 }) };
    const price = await fetchMt5OpenPriceWithRetry(rpc, 'pos-1', 1, 1);
    assert.equal(price, null);
  });
});
