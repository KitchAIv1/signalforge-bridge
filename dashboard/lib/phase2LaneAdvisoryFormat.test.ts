/**
 * Blocked filter + Combined Stack day-gate / shadow paper advisory kinds.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALPHAOMEGA_ADVISORY_SHADOW_ENTRY_PREFIX,
  ALPHAOMEGA_BLOCK_AMD_DAY_GATE,
  ALPHAOMEGA_BLOCK_NO_CRACK,
  formatAlphaOmegaBlockReason,
  formatAmdDayGateAdvisoryDetail,
} from './alphaOmegaAdvisoryParse.js';
import {
  isAlphaOmegaLiveBlock,
  resolvePhase2AdvisoryDisplay,
} from './phase2LaneAdvisoryFormat.js';

describe('AMD day gate advisory display', () => {
  it('labels the block reason for Activity / Exit column', () => {
    assert.equal(formatAlphaOmegaBlockReason(ALPHAOMEGA_BLOCK_AMD_DAY_GATE), 'AMD day gate');
  });

  it('parses Combined Stack advisory detail from lane_advisory', () => {
    const detail = formatAmdDayGateAdvisoryDetail(
      'AMD_DAY_GATE:tag=AMD_FAILED:taggedAt=2026-08-11T10:31:00.344Z:block',
    );
    assert.equal(detail, 'AMD_FAILED · tagged 10:31 UTC');
  });

  it('maps BLOCKED day-gate rows to amd_day_gate kind', () => {
    const display = resolvePhase2AdvisoryDisplay(
      'AMD_DAY_GATE:tag=AMD_FAILED:taggedAt=2026-08-11T10:31:00.344Z:block',
      'BLOCKED',
      ALPHAOMEGA_BLOCK_AMD_DAY_GATE,
    );
    assert.equal(display.kind, 'amd_day_gate');
    assert.equal(display.label, 'AMD DAY GATE');
  });

  it('includes amd_day_gate in the Live Blocked filter', () => {
    assert.equal(
      isAlphaOmegaLiveBlock({
        decision: 'BLOCKED',
        block_reason: ALPHAOMEGA_BLOCK_AMD_DAY_GATE,
        lane_advisory:
          'AMD_DAY_GATE:tag=AMD_FAILED:taggedAt=2026-08-11T10:31:00.344Z:block',
      }),
      true,
    );
    assert.equal(
      isAlphaOmegaLiveBlock({
        decision: 'BLOCKED',
        block_reason: ALPHAOMEGA_BLOCK_NO_CRACK,
        lane_advisory: null,
      }),
      true,
    );
  });
});

describe('Shadow paper entry advisory', () => {
  it('maps ALPHAOMEGA_SHADOW_ENTRY to shadow_paper_entry (not Clear)', () => {
    const advisory =
      `${ALPHAOMEGA_ADVISORY_SHADOW_ENTRY_PREFIX}:crack_len=17_speed=115.0m_src=matched`;
    const display = resolvePhase2AdvisoryDisplay(advisory, 'EXECUTED', null);
    assert.equal(display.kind, 'shadow_paper_entry');
    assert.equal(display.label, 'PAPER ENTRY');
  });
});
