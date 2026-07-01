/**
 * Regression fixture: real VT Markets deal history for a manually-closed
 * position (ticket 485392685, 2026-07-01). Before the fix, getTradeById
 * returned null for closed MT5 positions and the trade stayed stuck "open"
 * in bridge_trade_log forever.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildClosedTradeDetailsFromDeals } from './mt5DealHistory.js';

const REAL_CLOSED_POSITION_DEALS = [
  {
    id: '392752324',
    type: 'DEAL_TYPE_BUY',
    time: '2026-07-01T10:31:01.607Z',
    commission: 0,
    swap: 0,
    profit: 0,
    symbol: 'AUDUSD-VIP',
    orderId: '485392685',
    positionId: '485392685',
    volume: 2.12,
    price: 0.68945,
    entryType: 'DEAL_ENTRY_IN',
  },
  {
    id: '393234787',
    type: 'DEAL_TYPE_SELL',
    time: '2026-07-01T13:32:10.079Z',
    commission: 0,
    swap: 0,
    profit: 142.04,
    symbol: 'AUDUSD-VIP',
    orderId: '486075936',
    positionId: '485392685',
    volume: 2.12,
    price: 0.69012,
    entryType: 'DEAL_ENTRY_OUT',
  },
];

describe('buildClosedTradeDetailsFromDeals', () => {
  it('reconstructs close details matching real VT Markets deal history', () => {
    const details = buildClosedTradeDetailsFromDeals('485392685', REAL_CLOSED_POSITION_DEALS);
    assert.ok(details);
    assert.equal(details!.state, 'CLOSED');
    assert.equal(details!.averageClosePrice, 0.69012);
    assert.equal(details!.realizedPL, 142.04);
    assert.equal(details!.closeTime, '2026-07-01T13:32:10.079Z');
    assert.equal(details!.instrument, 'AUDUSD-VIP');
    assert.equal(details!.units, '212000');
  });

  it('returns null when position has no OUT deal (still open)', () => {
    const details = buildClosedTradeDetailsFromDeals('485392685', [REAL_CLOSED_POSITION_DEALS[0]!]);
    assert.equal(details, null);
  });

  it('returns null for empty deal history', () => {
    assert.equal(buildClosedTradeDetailsFromDeals('485392685', []), null);
  });

  it('volume-weights partial closes and sums realized P&L across all deals', () => {
    const partialCloseDeals = [
      { ...REAL_CLOSED_POSITION_DEALS[0], volume: 2.0, commission: -1 },
      {
        ...REAL_CLOSED_POSITION_DEALS[1],
        id: 'partial-1',
        volume: 1.0,
        price: 0.6900,
        profit: 50,
      },
      {
        ...REAL_CLOSED_POSITION_DEALS[1],
        id: 'partial-2',
        volume: 1.0,
        price: 0.6910,
        profit: 60,
        time: '2026-07-01T14:00:00.000Z',
      },
    ];
    const details = buildClosedTradeDetailsFromDeals('485392685', partialCloseDeals);
    assert.ok(details);
    // Weighted avg of (0.6900*1.0 + 0.6910*1.0) / 2.0
    assert.ok(Math.abs(details!.averageClosePrice! - 0.6905) < 1e-9);
    assert.equal(details!.realizedPL, 50 + 60 - 1);
    assert.equal(details!.closeTime, '2026-07-01T14:00:00.000Z');
  });
});
