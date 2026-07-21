/**
 * AO calendar R must use hard-stop pips, not signal-SL dollar pnl_r.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OMEGA_LANE_B_BROKER_ID } from './omegaLaneBConstants.js';
import type { PnlTradeRow } from './pnlCalendarTypes.js';
import {
  hasPnlCalendarTradeR,
  resolvePnlCalendarTradeR,
} from './resolvePnlCalendarTradeR.js';

function aoTrade(overrides: Partial<PnlTradeRow>): PnlTradeRow {
  return {
    id: '1',
    created_at: '2026-07-21T12:00:00Z',
    engine_id: 'omega',
    broker_id: OMEGA_LANE_B_BROKER_ID,
    direction: 'LONG',
    result: 'loss',
    pnl_r: null,
    pnl_pips: null,
    pnl_dollars: null,
    close_reason: null,
    bar1_strength: null,
    oanda_trade_id: '198',
    pair: 'AUD_USD',
    leg_type: null,
    signal_id: null,
    ...overrides,
  };
}

describe('resolvePnlCalendarTradeR Lane B AO', () => {
  it('uses pips / 10 even when stored signal-SL dollar R exists', () => {
    const trade = aoTrade({ pnl_pips: -5.2, pnl_r: -3.71, pnl_dollars: -1560 });
    assert.equal(resolvePnlCalendarTradeR(trade), -0.52);
  });

  it('uses pips / 10 when pnl_r is null', () => {
    const trade = aoTrade({ pnl_pips: -6.1, pnl_r: null });
    assert.equal(resolvePnlCalendarTradeR(trade), -0.61);
  });

  it('does not change non-AO omega stored R', () => {
    const trade = aoTrade({
      broker_id: 'oanda_practice',
      pnl_pips: -5.2,
      pnl_r: -1.25,
    });
    assert.equal(resolvePnlCalendarTradeR(trade), -1.25);
  });
});

describe('hasPnlCalendarTradeR', () => {
  it('is true for AO rows with pips even if pnl_r null', () => {
    assert.equal(hasPnlCalendarTradeR(aoTrade({ pnl_pips: 1.1, pnl_r: null })), true);
  });
});
