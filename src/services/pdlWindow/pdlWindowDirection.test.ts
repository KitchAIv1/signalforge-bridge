import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { directionFromConditions } from './pdlWindowConditions.js';
import {
  hardSlPrice,
  netPipsAfterSpread,
  signedTraderPips,
} from './pdlWindowPnl.js';

describe('directionFromConditions', () => {
  it('shorts all-false XXX', () => {
    assert.equal(
      directionFromConditions({ pdl_breach: false, london_down: false, h11_up: false }),
      'short',
    );
  });

  it('shorts all-true P1L1H1', () => {
    assert.equal(
      directionFromConditions({ pdl_breach: true, london_down: true, h11_up: true }),
      'short',
    );
  });

  it('longs partial conditions', () => {
    assert.equal(
      directionFromConditions({ pdl_breach: true, london_down: true, h11_up: false }),
      'long',
    );
    assert.equal(
      directionFromConditions({ pdl_breach: false, london_down: false, h11_up: true }),
      'long',
    );
  });
});

describe('pdlWindowPnl', () => {
  it('computes short SL above entry and long SL below', () => {
    assert.equal(hardSlPrice(0.65, 'long'), 0.6495);
    assert.equal(hardSlPrice(0.65, 'short'), 0.6505);
  });

  it('signs trader pips and nets VT spread', () => {
    assert.equal(signedTraderPips('long', 0.65, 0.651), 10);
    assert.equal(signedTraderPips('short', 0.65, 0.649), 10);
    assert.equal(netPipsAfterSpread(10), 8.5);
  });
});
