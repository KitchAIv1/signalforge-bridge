/**
 * AO close tagging must survive open-row miss and tradeMonitor race.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isAlphaOmegaCloseReason,
  persistAlphaOmegaClosedTradeLog,
} from './alphaOmegaCloseTradeLog.js';
import { ALPHAOMEGA_CLOSE_OPPOSING_COUNT } from './alphaOmegaConstants.js';

type QueryResult = { data: unknown; error: { message: string } | null };

function createMockSupabase(handlers: {
  onOpenSelect: () => QueryResult;
  onLatestSelect?: () => QueryResult;
  onUpdate: (payload: Record<string, unknown>, id: string) => QueryResult;
}): { supabase: SupabaseClient; updates: Array<Record<string, unknown>> } {
  const updates: Array<Record<string, unknown>> = [];
  let selectCall = 0;

  const supabase = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return this;
            },
            order(_col: string, _opts: unknown) {
              return this;
            },
            limit(_n: number) {
              return this;
            },
            async maybeSingle() {
              selectCall += 1;
              if (selectCall === 1) return handlers.onOpenSelect();
              return (handlers.onLatestSelect ?? handlers.onOpenSelect)();
            },
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(_col: string, id: string) {
              updates.push(payload);
              return Promise.resolve(handlers.onUpdate(payload, id));
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  return { supabase, updates };
}

const openLogRow = {
  id: 'log-198',
  status: 'open',
  close_reason: null,
  fill_price: 0.70188,
  stop_loss: 0.70174,
  units: 3_000_000,
  direction: 'LONG',
};

describe('isAlphaOmegaCloseReason', () => {
  it('detects alphaomega_* reasons only', () => {
    assert.equal(isAlphaOmegaCloseReason(ALPHAOMEGA_CLOSE_OPPOSING_COUNT), true);
    assert.equal(isAlphaOmegaCloseReason('external_close'), false);
    assert.equal(isAlphaOmegaCloseReason(null), false);
  });
});

describe('persistAlphaOmegaClosedTradeLog', () => {
  it('tags open row with AO reason', async () => {
    const { supabase, updates } = createMockSupabase({
      onOpenSelect: () => ({ data: openLogRow, error: null }),
      onUpdate: () => ({ data: null, error: null }),
    });

    const ok = await persistAlphaOmegaClosedTradeLog(supabase, {
      oandaTradeId: '198',
      brokerId: 'oanda_phase2_demo',
      reason: ALPHAOMEGA_CLOSE_OPPOSING_COUNT,
      closedAt: '2026-07-21T12:21:01.000Z',
      exitPriceNum: 0.70136,
      pnlDollars: -1560,
      pnlPips: -5.2,
    });

    assert.equal(ok, true);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].close_reason, ALPHAOMEGA_CLOSE_OPPOSING_COUNT);
    assert.equal(updates[0].status, 'closed');
  });

  it('repairs null reason after tradeMonitor closed the row first', async () => {
    const closedUntagged = {
      ...openLogRow,
      status: 'closed',
      close_reason: null,
    };
    const { supabase, updates } = createMockSupabase({
      onOpenSelect: () => ({ data: null, error: null }),
      onLatestSelect: () => ({ data: closedUntagged, error: null }),
      onUpdate: () => ({ data: null, error: null }),
    });

    const ok = await persistAlphaOmegaClosedTradeLog(supabase, {
      oandaTradeId: '198',
      brokerId: 'oanda_phase2_demo',
      reason: ALPHAOMEGA_CLOSE_OPPOSING_COUNT,
      closedAt: '2026-07-21T12:21:01.000Z',
      exitPriceNum: 0.70136,
      pnlDollars: -1560,
      pnlPips: -5.2,
    });

    assert.equal(ok, true);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].close_reason, ALPHAOMEGA_CLOSE_OPPOSING_COUNT);
  });

  it('overwrites external_close with authoritative AO reason', async () => {
    const closedExternal = {
      ...openLogRow,
      status: 'closed',
      close_reason: 'external_close',
    };
    const { supabase, updates } = createMockSupabase({
      onOpenSelect: () => ({ data: null, error: null }),
      onLatestSelect: () => ({ data: closedExternal, error: null }),
      onUpdate: () => ({ data: null, error: null }),
    });

    const ok = await persistAlphaOmegaClosedTradeLog(supabase, {
      oandaTradeId: '198',
      brokerId: 'oanda_phase2_demo',
      reason: ALPHAOMEGA_CLOSE_OPPOSING_COUNT,
      closedAt: '2026-07-21T12:21:01.000Z',
      exitPriceNum: 0.70136,
      pnlDollars: -1560,
      pnlPips: -5.2,
    });

    assert.equal(ok, true);
    assert.equal(updates[0].close_reason, ALPHAOMEGA_CLOSE_OPPOSING_COUNT);
  });

  it('does not overwrite an existing alphaomega_* reason', async () => {
    const alreadyTagged = {
      ...openLogRow,
      status: 'closed',
      close_reason: ALPHAOMEGA_CLOSE_OPPOSING_COUNT,
    };
    const { supabase, updates } = createMockSupabase({
      onOpenSelect: () => ({ data: alreadyTagged, error: null }),
      onUpdate: () => ({ data: null, error: null }),
    });

    const ok = await persistAlphaOmegaClosedTradeLog(supabase, {
      oandaTradeId: '198',
      brokerId: 'oanda_phase2_demo',
      reason: 'alphaomega_hard_stop',
      closedAt: '2026-07-21T12:21:01.000Z',
      exitPriceNum: 0.70136,
      pnlDollars: -1560,
      pnlPips: -5.2,
    });

    assert.equal(ok, true);
    assert.equal(updates.length, 0);
  });

  it('retries once when the first update fails', async () => {
    let updateCalls = 0;
    const { supabase, updates } = createMockSupabase({
      onOpenSelect: () => ({ data: openLogRow, error: null }),
      onUpdate: () => {
        updateCalls += 1;
        if (updateCalls === 1) return { data: null, error: { message: 'transient' } };
        return { data: null, error: null };
      },
    });

    const ok = await persistAlphaOmegaClosedTradeLog(supabase, {
      oandaTradeId: '198',
      brokerId: 'oanda_phase2_demo',
      reason: ALPHAOMEGA_CLOSE_OPPOSING_COUNT,
      closedAt: '2026-07-21T12:21:01.000Z',
      exitPriceNum: 0.70136,
      pnlDollars: -1560,
      pnlPips: -5.2,
    });

    assert.equal(ok, true);
    assert.equal(updates.length, 2);
  });
});
