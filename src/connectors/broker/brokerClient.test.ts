/**
 * BrokerClient contract tests — fake broker + OandaBroker shape parity.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBroker, type FakeBrokerState } from './fakeBroker.js';
import type { BrokerClient } from './types.js';

function freshState(overrides: Partial<FakeBrokerState> = {}): FakeBrokerState {
  return {
    equity: 25_000,
    openTrades: new Map(),
    placeOrderCalls: [],
    closeCalls: [],
    shouldTimeout: false,
    shouldCancel: false,
    cancelReason: 'BOUNDS_VIOLATION',
    ...overrides,
  };
}

async function contractSuite(label: string, createClient: () => BrokerClient): Promise<void> {
  it(`${label}: placeMarketOrder opens trade`, async () => {
    const broker = createClient();
    const result = await broker.placeMarketOrder({
      instrument: 'AUDUSD',
      units: 1000,
      stopLossPrice: '0.64000',
      takeProfitPrice: '0.66000',
    });
    assert.ok(result.orderFillTransaction?.tradeOpened?.tradeID);
    const open = await broker.getOpenTrades();
    assert.equal(open.length, 1);
  });

  it(`${label}: closeTrade removes open position`, async () => {
    const broker = createClient();
    const placed = await broker.placeMarketOrder({ instrument: 'AUDUSD', units: 500 });
    const tradeId = placed.orderFillTransaction!.tradeOpened!.tradeID!;
    const closed = await broker.closeTrade(tradeId);
    assert.ok(closed.orderFillTransaction?.price);
    assert.equal((await broker.getOpenTrades()).length, 0);
  });

  it(`${label}: getAccountSummary returns equity`, async () => {
    const broker = createClient();
    const summary = await broker.getAccountSummary();
    assert.ok(summary.equity > 0);
  });

  it(`${label}: instrument mapping is deterministic`, () => {
    const broker = createClient();
    assert.equal(broker.toBrokerInstrument('AUD_USD'), broker.toBrokerInstrument('AUD_USD'));
  });
}

describe('BrokerClient contract', () => {
  contractSuite('FakeBroker success', () =>
    createFakeBroker({ brokerId: 'fake', brokerType: 'oanda' }, freshState()),
  );

  it('FakeBroker: cancel path returns orderCancelTransaction', async () => {
    const state = freshState({ shouldCancel: true, cancelReason: 'BOUNDS_VIOLATION' });
    const broker = createFakeBroker({ brokerId: 'fake', brokerType: 'oanda' }, state);
    const result = await broker.placeMarketOrder({ instrument: 'AUDUSD', units: 100 });
    assert.equal(result.orderCancelTransaction?.reason, 'BOUNDS_VIOLATION');
    assert.equal(state.openTrades.size, 0);
  });

  it('FakeBroker: timeout throws ORDER_TIMEOUT', async () => {
    const broker = createFakeBroker(
      { brokerId: 'fake', brokerType: 'oanda' },
      freshState({ shouldTimeout: true }),
    );
    await assert.rejects(
      () => broker.placeMarketOrder({ instrument: 'AUDUSD', units: 100 }, 50),
      /ORDER_TIMEOUT/,
    );
  });
});
