import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALPHAOMEGA_ADVISORY_SPEEDBAND_PREFIX,
  ALPHAOMEGA_BLOCK_ENTRY_BLACKOUT,
  ALPHAOMEGA_BLOCK_SPEED_MID_BAND,
  formatAlphaOmegaBlockReason,
  isAlphaOmegaSpeedBandAdvisory,
  isAlphaOmegaSpeedFloorAdvisory,
} from './alphaOmegaAdvisoryParse.js';

describe('alphaOmegaAdvisoryParse — mid-band / blackout labels', () => {
  it('labels new gate block reasons for Activity', () => {
    assert.equal(
      formatAlphaOmegaBlockReason(ALPHAOMEGA_BLOCK_SPEED_MID_BAND),
      'Speed mid-band (45–60)',
    );
    assert.equal(
      formatAlphaOmegaBlockReason(ALPHAOMEGA_BLOCK_ENTRY_BLACKOUT),
      'Asia open blackout',
    );
  });

  it('distinguishes SPEEDBAND forensics from SPEEDFLOOR paper prefix', () => {
    const mid = `${ALPHAOMEGA_ADVISORY_SPEEDBAND_PREFIX}would_enter:LONG:speed=50.0m:len=8`;
    const floor = 'ALPHAOMEGA_SPEEDFLOOR_SHADOW:would_enter:LONG:speed=35.0m:len=7';
    assert.equal(isAlphaOmegaSpeedBandAdvisory(mid), true);
    assert.equal(isAlphaOmegaSpeedFloorAdvisory(mid), false);
    assert.equal(isAlphaOmegaSpeedBandAdvisory(floor), false);
    assert.equal(isAlphaOmegaSpeedFloorAdvisory(floor), true);
  });
});
