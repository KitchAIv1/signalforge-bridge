import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { placeMt5MarketOrder } from './mt5OrderHelpers.js';

describe('placeMt5MarketOrder lot volume', () => {
  it('passes positive lots to createMarketSellOrder for SHORT units', async () => {
    let sellVolume: number | null = null;
    const rpc = {
      createMarketBuyOrder: async () => {
        throw new Error('unexpected buy');
      },
      createMarketSellOrder: async (_symbol: string, volume: number) => {
        sellVolume = volume;
        return { stringCode: 'TRADE_RETCODE_DONE', positionId: '999' };
      },
      getPosition: async () => ({ openPrice: 0.69 }),
    };

    await placeMt5MarketOrder(
      rpc as never,
      { instrument: 'AUDUSD-VIP', units: -100_000, magicNumber: 88001 },
      'AUDUSD-VIP',
      -1,
    );

    assert.equal(sellVolume, 1);
  });

  it('passes positive lots to createMarketBuyOrder for LONG units', async () => {
    let buyVolume: number | null = null;
    const rpc = {
      createMarketBuyOrder: async (_symbol: string, volume: number) => {
        buyVolume = volume;
        return { stringCode: 'TRADE_RETCODE_DONE', positionId: '888' };
      },
      createMarketSellOrder: async () => {
        throw new Error('unexpected sell');
      },
      getPosition: async () => ({ openPrice: 0.69 }),
    };

    await placeMt5MarketOrder(
      rpc as never,
      { instrument: 'AUDUSD-VIP', units: 100_000, magicNumber: 88001 },
      'AUDUSD-VIP',
      1,
    );

    assert.equal(buyVolume, 1);
  });
});
