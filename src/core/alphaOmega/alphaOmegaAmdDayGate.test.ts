/**
 * AMD-day gate causality: blocks only AMD_FAILED signals at/after the tag
 * write, passes everything else, and fails open on read errors.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateAlphaOmegaAmdDayGate } from './alphaOmegaAmdDayGate.js';
import { ALPHAOMEGA_BLOCK_AMD_DAY_GATE } from './alphaOmegaConstants.js';

type QueryResult = { data: unknown; error: { message: string } | null };

function createMockSupabase(handlers: {
  onConfigSelect: () => QueryResult;
  onAmdStateSelect: () => QueryResult;
}): SupabaseClient {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return this;
            },
            async maybeSingle() {
              if (table === 'bridge_config') return handlers.onConfigSelect();
              return handlers.onAmdStateSelect();
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

const TAG_WRITE_ISO = '2026-08-04T10:31:00.000Z';

function mockWith(options: {
  enabled: boolean;
  amdTag: string | null;
  amdStateError?: boolean;
  amdStateMissing?: boolean;
}): SupabaseClient {
  return createMockSupabase({
    onConfigSelect: () => ({
      data: { config_value: options.enabled },
      error: null,
    }),
    onAmdStateSelect: () => {
      if (options.amdStateError) return { data: null, error: { message: 'boom' } };
      if (options.amdStateMissing) return { data: null, error: null };
      return {
        data: { amd_tag: options.amdTag, created_at: TAG_WRITE_ISO },
        error: null,
      };
    },
  });
}

describe('evaluateAlphaOmegaAmdDayGate', () => {
  it('blocks an AMD_FAILED-day signal fired after the tag write when enabled', async () => {
    const result = await evaluateAlphaOmegaAmdDayGate(
      mockWith({ enabled: true, amdTag: 'AMD_FAILED' }),
      { entryAtIso: '2026-08-04T14:00:00.000Z', signalId: 'sig-1' },
    );
    assert.equal(result.shouldBlock, true);
    assert.equal(result.blockReason, ALPHAOMEGA_BLOCK_AMD_DAY_GATE);
    assert.match(result.shadowAdvisory ?? '', /AMD_DAY_GATE:tag=AMD_FAILED/);
  });

  it('passes a signal fired BEFORE the 10:31 tag write (no look-ahead)', async () => {
    const result = await evaluateAlphaOmegaAmdDayGate(
      mockWith({ enabled: true, amdTag: 'AMD_FAILED' }),
      { entryAtIso: '2026-08-04T09:45:00.000Z' },
    );
    assert.equal(result.wouldSkip, false);
    assert.equal(result.shouldBlock, false);
  });

  it('passes a signal at exactly the tag write time boundary as blocked', async () => {
    const result = await evaluateAlphaOmegaAmdDayGate(
      mockWith({ enabled: true, amdTag: 'AMD_FAILED' }),
      { entryAtIso: TAG_WRITE_ISO },
    );
    assert.equal(result.shouldBlock, true);
  });

  it('passes non-FAILED tags (AMD_SHIFTED) regardless of time', async () => {
    const result = await evaluateAlphaOmegaAmdDayGate(
      mockWith({ enabled: true, amdTag: 'AMD_SHIFTED' }),
      { entryAtIso: '2026-08-04T14:00:00.000Z' },
    );
    assert.equal(result.wouldSkip, false);
    assert.equal(result.shouldBlock, false);
  });

  it('shadow-reports without blocking when the kill switch is OFF', async () => {
    const result = await evaluateAlphaOmegaAmdDayGate(
      mockWith({ enabled: false, amdTag: 'AMD_FAILED' }),
      { entryAtIso: '2026-08-04T14:00:00.000Z' },
    );
    assert.equal(result.wouldSkip, true);
    assert.equal(result.shouldBlock, false);
    assert.equal(result.blockReason, null);
    assert.match(result.shadowAdvisory ?? '', /would_skip/);
  });

  it('fails open when the amd_state read errors', async () => {
    const result = await evaluateAlphaOmegaAmdDayGate(
      mockWith({ enabled: true, amdTag: 'AMD_FAILED', amdStateError: true }),
      { entryAtIso: '2026-08-04T14:00:00.000Z' },
    );
    assert.equal(result.shouldBlock, false);
  });

  it('fails open when no amd_state row exists (weekend/holiday)', async () => {
    const result = await evaluateAlphaOmegaAmdDayGate(
      mockWith({ enabled: true, amdTag: 'AMD_FAILED', amdStateMissing: true }),
      { entryAtIso: '2026-08-04T14:00:00.000Z' },
    );
    assert.equal(result.shouldBlock, false);
  });

  it('fails open on an unparseable entry timestamp', async () => {
    const result = await evaluateAlphaOmegaAmdDayGate(
      mockWith({ enabled: true, amdTag: 'AMD_FAILED' }),
      { entryAtIso: 'not-a-date' },
    );
    assert.equal(result.shouldBlock, false);
  });
});
