/**
 * Unit tests: fixed pip peak giveback → absolute trail_distance for Omega.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeTrailInsertFields } from '../../monitoring/trailingStopSupport.js';
import { omegaPeakGivebackPriceDistance } from './omegaRawTrailGiveback.js';

describe('omegaPeakGivebackPriceDistance', () => {
  it('maps 1.5 pips to 0.00015 on AUD_USD', () => {
    assert.ok(Math.abs(omegaPeakGivebackPriceDistance(1.5, 'AUD_USD') - 0.00015) < 1e-12);
  });

  it('maps 1.5 pips to 0.015 on USD_JPY', () => {
    assert.equal(omegaPeakGivebackPriceDistance(1.5, 'USD_JPY'), 0.015);
  });
});

describe('computeTrailInsertFields omega fixed giveback', () => {
  const baseRow = {
    engine_id: 'omega',
    pair: 'AUD_USD',
    direction: 'long',
    fill_price: 0.65,
    stop_loss: 0.649,
  };

  it('uses fixed pip distance when omegaPeakGivebackPips is set', () => {
    const metrics = computeTrailInsertFields(baseRow, { omegaPeakGivebackPips: 1.5 });
    assert.ok(metrics);
    assert.ok(Math.abs(metrics!.trailDistance - 0.00015) < 1e-12);
    assert.ok(Math.abs(metrics!.rSizeRaw - 0.001) < 1e-12);
  });

  it('keeps legacy 0.5R when giveback is null', () => {
    const metrics = computeTrailInsertFields(baseRow, { omegaPeakGivebackPips: null });
    assert.ok(metrics);
    assert.equal(metrics!.trailDistance, metrics!.rSizeRaw * 0.5);
  });

  it('does not apply fixed giveback to non-omega engines', () => {
    const metrics = computeTrailInsertFields(
      { ...baseRow, engine_id: 'charlie' },
      { omegaPeakGivebackPips: 1.5 },
    );
    assert.ok(metrics);
    assert.notEqual(metrics!.trailDistance, 0.00015);
  });
});
