/**
 * Unit tests: engine_amd trail exit with independent arm / giveback.
 * Legacy parity requirement: armPips === givebackPips must reproduce the
 * original coupled trailExitFired math exactly (arm gate on peak gain,
 * exit level = peak -/+ giveback).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { amdTrailExitFired } from './amdTrailSplit.js';

const FILL = 0.65;
const PIP = 0.0001;

function price(pipsFromFill: number): number {
  return FILL + pipsFromFill * PIP;
}

// Boundary note: all thresholds are tested with a 0.05-0.1 pip margin.
// Prices are 5-decimal floats, so exact pip-boundary equality is FP-fuzzy in
// production too; the margin cases are the real behavioral contract.
describe('amdTrailExitFired — legacy parity (arm === giveback)', () => {
  it('does not fire before peak gain reaches the coupled distance', () => {
    assert.equal(amdTrailExitFired('long', FILL, price(4.9), price(-2), 5, 5), false);
  });

  it('fires once armed and price retreats the coupled distance from peak', () => {
    assert.equal(amdTrailExitFired('long', FILL, price(5.1), price(0.05), 5, 5), true);
    assert.equal(amdTrailExitFired('long', FILL, price(5.1), price(0.2), 5, 5), false);
  });

  it('mirrors for shorts', () => {
    assert.equal(amdTrailExitFired('short', FILL, price(-5.1), price(0), 5, 5), true);
    assert.equal(amdTrailExitFired('short', FILL, price(-4.9), price(2), 5, 5), false);
  });
});

describe('amdTrailExitFired — split arm 6 / giveback 4', () => {
  it('does not fire when peak gain is below the 6-pip arm, even on full retreat', () => {
    assert.equal(amdTrailExitFired('long', FILL, price(5.9), price(0), 6, 4), false);
  });

  it('fires when armed at 6 and price retreats 4 from peak', () => {
    assert.equal(amdTrailExitFired('long', FILL, price(6.1), price(2), 6, 4), true);
  });

  it('does not fire when armed but retreat is under 4 pips', () => {
    assert.equal(amdTrailExitFired('long', FILL, price(6.1), price(2.2), 6, 4), false);
  });

  it('banks peak minus giveback on a large runner (peak 10 -> exit near +6)', () => {
    assert.equal(amdTrailExitFired('long', FILL, price(10), price(5.9), 6, 4), true);
    assert.equal(amdTrailExitFired('long', FILL, price(10), price(6.2), 6, 4), false);
  });

  it('mirrors for shorts', () => {
    assert.equal(amdTrailExitFired('short', FILL, price(-7), price(-2.9), 6, 4), true);
    assert.equal(amdTrailExitFired('short', FILL, price(-7), price(-3.2), 6, 4), false);
    assert.equal(amdTrailExitFired('short', FILL, price(-5.9), price(0), 6, 4), false);
  });
});
