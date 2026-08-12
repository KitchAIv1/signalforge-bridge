import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPeakFadeConfigEnabled } from './peakFadeConfigGate.js';

function fakeSupabase(configValue: unknown) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: { config_value: configValue },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };
}

describe('isPeakFadeConfigEnabled', () => {
  it('fail-closed when row missing', async () => {
    const empty = {
      from() {
        return {
          select() {
            return {
              eq() {
                return { maybeSingle: async () => ({ data: null, error: null }) };
              },
            };
          },
        };
      },
    };
    assert.equal(await isPeakFadeConfigEnabled(empty as never), false);
  });

  it('true only for boolean/string true', async () => {
    assert.equal(await isPeakFadeConfigEnabled(fakeSupabase(true) as never), true);
    assert.equal(await isPeakFadeConfigEnabled(fakeSupabase('true') as never), true);
    assert.equal(await isPeakFadeConfigEnabled(fakeSupabase(false) as never), false);
  });
});
