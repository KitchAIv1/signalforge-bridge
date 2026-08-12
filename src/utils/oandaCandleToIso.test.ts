import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampOandaToIso, OANDA_TO_SKEW_MS } from './oandaCandleToIso.js';

describe('clampOandaToIso', () => {
  const nowMs = Date.parse('2026-08-12T19:34:10.000Z');

  it('leaves past to unchanged', () => {
    const past = '2026-08-12T18:00:00.000Z';
    assert.equal(clampOandaToIso(past, nowMs), past);
  });

  it('clamps exact now behind skew', () => {
    const nowIso = new Date(nowMs).toISOString();
    assert.equal(
      clampOandaToIso(nowIso, nowMs),
      new Date(nowMs - OANDA_TO_SKEW_MS).toISOString(),
    );
  });

  it('clamps a few seconds ahead of now', () => {
    const ahead = new Date(nowMs + 2_000).toISOString();
    assert.equal(
      clampOandaToIso(ahead, nowMs),
      new Date(nowMs - OANDA_TO_SKEW_MS).toISOString(),
    );
  });
});
