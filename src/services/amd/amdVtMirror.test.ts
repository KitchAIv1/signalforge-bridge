/**
 * VT mirror config guards: kill switch defaults OFF, multiplier clamps to the
 * safe default on invalid values.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAmdVtMirrorEnabled, loadAmdVtSizeMultiplier } from './amdVtMirror.js';
import { amdStateBrokerId } from './amdVenueOps.js';

function mockConfigSupabase(configValue: unknown, hasRow = true): SupabaseClient {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return this;
            },
            async maybeSingle() {
              return hasRow
                ? { data: { config_value: configValue }, error: null }
                : { data: null, error: null };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe('isAmdVtMirrorEnabled', () => {
  it('defaults OFF when the row is missing', async () => {
    assert.equal(await isAmdVtMirrorEnabled(mockConfigSupabase(null, false)), false);
  });

  it('reads true/"true" as ON', async () => {
    assert.equal(await isAmdVtMirrorEnabled(mockConfigSupabase(true)), true);
    assert.equal(await isAmdVtMirrorEnabled(mockConfigSupabase('true')), true);
  });
});

describe('loadAmdVtSizeMultiplier', () => {
  it('returns the stored valid multiplier', async () => {
    assert.equal(await loadAmdVtSizeMultiplier(mockConfigSupabase(0.5)), 0.5);
  });

  it('falls back to 0.05 on missing, non-numeric, or out-of-range values', async () => {
    assert.equal(await loadAmdVtSizeMultiplier(mockConfigSupabase(null, false)), 0.05);
    assert.equal(await loadAmdVtSizeMultiplier(mockConfigSupabase('abc')), 0.05);
    assert.equal(await loadAmdVtSizeMultiplier(mockConfigSupabase(0)), 0.05);
    assert.equal(await loadAmdVtSizeMultiplier(mockConfigSupabase(5)), 0.05);
  });
});

describe('amdStateBrokerId', () => {
  it('reads the row broker_id when present', () => {
    assert.equal(
      amdStateBrokerId({ broker_id: 'vtmarkets_ao_live' }),
      'vtmarkets_ao_live',
    );
  });

  it('defaults pre-migration rows to the OANDA book', () => {
    assert.equal(amdStateBrokerId({}), 'oanda_amd_demo');
    assert.equal(amdStateBrokerId({ broker_id: null }), 'oanda_amd_demo');
    assert.equal(amdStateBrokerId({ broker_id: '' }), 'oanda_amd_demo');
  });
});
