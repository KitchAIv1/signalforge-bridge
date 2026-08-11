/**
 * AMD dual-book fan-out: work-remaining gate, VT BLOCKED breadcrumb, settle isolation.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { settleBrokerFanOutTasks } from '../../core/alphaOmega/runAoFanOutParallel.js';
import { hasAmdEntryWorkRemaining } from './hasAmdEntryWorkRemaining.js';
import { writeAmdVtBlockedLog } from './amdVtMirror.js';

type ExecutedMap = Record<string, boolean>;

function mockWorkRemainingSupabase(
  executedByBroker: ExecutedMap,
  vtMirrorEnabled: boolean,
): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'bridge_config') {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              async maybeSingle() {
                return {
                  data: { config_value: vtMirrorEnabled },
                  error: null,
                };
              },
            };
          },
        };
      }
      const filters: Record<string, unknown> = {};
      return {
        select() {
          return this;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return this;
        },
        gte() {
          return this;
        },
        async then(resolve: (value: { count: number; error: null }) => unknown) {
          const brokerId = String(filters.broker_id ?? '');
          const count = executedByBroker[brokerId] ? 1 : 0;
          return resolve({ count, error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe('hasAmdEntryWorkRemaining', () => {
  it('returns false when OANDA done and VT kill-switch OFF', async () => {
    const supabase = mockWorkRemainingSupabase({ oanda_amd_demo: true }, false);
    assert.equal(await hasAmdEntryWorkRemaining(supabase, '2026-08-11'), false);
  });

  it('returns true when OANDA done but VT still open (kill-switch ON)', async () => {
    const supabase = mockWorkRemainingSupabase(
      { oanda_amd_demo: true, vtmarkets_ao_live: false },
      true,
    );
    assert.equal(await hasAmdEntryWorkRemaining(supabase, '2026-08-11'), true);
  });

  it('returns true when VT done but OANDA still open', async () => {
    const supabase = mockWorkRemainingSupabase(
      { oanda_amd_demo: false, vtmarkets_ao_live: true },
      true,
    );
    assert.equal(await hasAmdEntryWorkRemaining(supabase, '2026-08-11'), true);
  });

  it('returns false when both venues EXECUTED and VT enabled', async () => {
    const supabase = mockWorkRemainingSupabase(
      { oanda_amd_demo: true, vtmarkets_ao_live: true },
      true,
    );
    assert.equal(await hasAmdEntryWorkRemaining(supabase, '2026-08-11'), false);
  });
});

describe('writeAmdVtBlockedLog', () => {
  it('inserts BLOCKED on vtmarkets_ao_live with the given reason', async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const supabase = {
      from(table: string) {
        assert.equal(table, 'bridge_trade_log');
        return {
          async insert(row: Record<string, unknown>) {
            inserts.push(row);
            return { error: null };
          },
        };
      },
    } as unknown as SupabaseClient;

    await writeAmdVtBlockedLog(
      {
        supabase,
        tag: 'AMD_FAILED',
        direction: 'long',
        amdRow: {
          evaluated_at: '2026-08-11T10:31:00Z',
          layer4_d1_bias: 'bullish',
          daily_bias_alignment: 'aligned',
        },
        plan: {
          entryPrice: 0.65,
          hardSlPrice: 0.6485,
          hardSlPips: 15,
          signedUnits: 1000,
          equity: 10_000,
          weight: 1,
          sizeMultiplier: 1,
          exitStrategy: 'TRAIL',
        },
      },
      'MT5_ORDER_ERROR: no position id',
    );

    assert.equal(inserts.length, 1);
    assert.equal(inserts[0]?.broker_id, 'vtmarkets_ao_live');
    assert.equal(inserts[0]?.decision, 'BLOCKED');
    assert.equal(inserts[0]?.block_reason, 'MT5_ORDER_ERROR: no position id');
    assert.equal(inserts[0]?.engine_id, 'engine_amd');
  });
});

describe('AMD dual-book settle isolation', () => {
  it('keeps the successful leg when the other rejects', async () => {
    const completed: string[] = [];
    await settleBrokerFanOutTasks('AMD dual-book test', [
      async () => {
        completed.push('oanda');
      },
      async () => {
        throw new Error('vt-fail');
      },
    ]);
    assert.deepEqual(completed, ['oanda']);
  });
});
