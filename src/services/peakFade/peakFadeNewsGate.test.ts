import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isInPeakFadeNewsWindow } from './peakFadeNewsGate.js';

describe('peakFadeNewsGate window', () => {
  const eventMs = Date.parse('2026-08-11T15:00:00.000Z');

  it('blocks 2h before event', () => {
    const now = Date.parse('2026-08-11T13:00:00.000Z');
    assert.equal(isInPeakFadeNewsWindow(now, eventMs, 2, 1), true);
  });

  it('blocks 1h after event', () => {
    const now = Date.parse('2026-08-11T16:00:00.000Z');
    assert.equal(isInPeakFadeNewsWindow(now, eventMs, 2, 1), true);
  });

  it('allows just outside pre window', () => {
    const now = Date.parse('2026-08-11T12:59:00.000Z');
    assert.equal(isInPeakFadeNewsWindow(now, eventMs, 2, 1), false);
  });

  it('allows after post window', () => {
    const now = Date.parse('2026-08-11T16:01:00.000Z');
    assert.equal(isInPeakFadeNewsWindow(now, eventMs, 2, 1), false);
  });
});
