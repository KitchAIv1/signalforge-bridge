import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tradeMatchesCalendarFilter } from './pnlCalendarEngineFilter.js';
import {
  isLiveAlphaOmegaCalendarTrade,
  isShadowAoCalendarTrade,
  isSpeedfloorPaperCalendarClose,
} from './pnlCalendarLiveAo.js';
import type { PnlTradeRow } from './pnlCalendarTypes.js';

function trade(partial: Partial<PnlTradeRow>): PnlTradeRow {
  return {
    id: '1',
    created_at: '2026-08-01T12:00:00.000Z',
    engine_id: 'omega',
    broker_id: 'oanda_phase2_demo',
    decision: 'EXECUTED',
    direction: 'LONG',
    result: 'win',
    pnl_r: 1,
    pnl_pips: 10,
    pnl_dollars: 100,
    close_reason: 'alphaomega_opposing_count',
    bar1_strength: null,
    oanda_trade_id: 't-1',
    pair: 'AUD_USD',
    leg_type: null,
    signal_id: 's-1',
    ...partial,
  };
}

describe('pnlCalendarLiveAo', () => {
  it('keeps live EXECUTED AO fills', () => {
    assert.equal(isLiveAlphaOmegaCalendarTrade(trade({})), true);
  });

  it('drops SPEEDFLOOR paper BLOCKED on live AO brokers', () => {
    const row = trade({
      decision: 'BLOCKED',
      oanda_trade_id: null,
      close_reason: 'speedfloor_paper_opposing',
      pnl_pips: -3,
    });
    assert.equal(isSpeedfloorPaperCalendarClose(row), true);
    assert.equal(isLiveAlphaOmegaCalendarTrade(row), false);
  });

  it('drops ao_shadow_paper from AO and Omega filters', () => {
    const row = trade({
      broker_id: 'ao_shadow_paper',
      decision: 'EXECUTED',
    });
    assert.equal(isShadowAoCalendarTrade(row), true);
    assert.equal(isLiveAlphaOmegaCalendarTrade(row), false);
    assert.equal(
      tradeMatchesCalendarFilter(row, new Set(['alphaomega', 'omega'])),
      false,
    );
  });

  it('does not leak BLOCKED AO paper into Omega filter', () => {
    const row = trade({
      decision: 'BLOCKED',
      oanda_trade_id: null,
      close_reason: 'speedfloor_paper_hard_stop',
    });
    assert.equal(
      tradeMatchesCalendarFilter(row, new Set(['alphaomega', 'omega'])),
      false,
    );
  });

  it('matches alphaomega for live VT AO EXECUTED', () => {
    const row = trade({ broker_id: 'vtmarkets_ao_live' });
    assert.equal(tradeMatchesCalendarFilter(row, new Set(['alphaomega'])), true);
  });
});
