import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildRefuseTapeContext,
  formatToxicCrackAdvisory,
  isShallowCrack,
  isWeakCrackVsBlocked,
  shouldSkipToxicCrack,
  type ToxicCrackFireRow,
} from './alphaOmegaToxicCrackFeatures.js';

function blockedNoCrack(createdAt: string, confluence: number | null = 20): ToxicCrackFireRow {
  return {
    createdAt,
    decision: 'BLOCKED',
    blockReason: 'ALPHAOMEGA_NO_QUALIFYING_CRACK',
    confluence,
  };
}

describe('alphaOmegaToxicCrackFeatures — CF parity', () => {
  it('isShallowCrack requires len=7 and speed<=40', () => {
    assert.equal(isShallowCrack({ foundingLength: 7, foundingSpeedMin: 40, confluence: 10 }), true);
    assert.equal(isShallowCrack({ foundingLength: 7, foundingSpeedMin: 40.1, confluence: 10 }), false);
    assert.equal(isShallowCrack({ foundingLength: 8, foundingSpeedMin: 35, confluence: 10 }), false);
  });

  it('refuseTape needs >=3 fires, blockRate>=0.75, >=3 NO_QUALIFYING_CRACK', () => {
    const entryAt = '2026-07-21T08:36:00.000Z';
    const fires: ToxicCrackFireRow[] = [
      blockedNoCrack('2026-07-21T06:00:00.000Z'),
      blockedNoCrack('2026-07-21T07:00:00.000Z'),
      blockedNoCrack('2026-07-21T08:00:00.000Z'),
    ];
    const ctx = buildRefuseTapeContext(fires, entryAt);
    assert.equal(ctx.refuseTape, true);
    assert.equal(ctx.preFireCount, 3);
    assert.equal(ctx.preNoCrackCount, 3);
    assert.equal(ctx.preBlockRate, 1);
  });

  it('shouldSkipToxicCrack is intersection of shallow + refuse + weak conf', () => {
    const entryAt = '2026-07-21T08:36:00.000Z';
    const fires: ToxicCrackFireRow[] = [
      blockedNoCrack('2026-07-21T06:00:00.000Z', 22),
      blockedNoCrack('2026-07-21T07:00:00.000Z', 22),
      blockedNoCrack('2026-07-21T08:00:00.000Z', 22),
    ];
    const ctx = buildRefuseTapeContext(fires, entryAt);
    const skip = shouldSkipToxicCrack(
      { foundingLength: 7, foundingSpeedMin: 40, confluence: 15 },
      ctx,
    );
    assert.equal(skip, true);

    const deep = shouldSkipToxicCrack(
      { foundingLength: 12, foundingSpeedMin: 70, confluence: 15 },
      ctx,
    );
    assert.equal(deep, false);
  });

  it('isWeakCrackVsBlocked caps at min(18, avgBlockedConf)', () => {
    const ctx = buildRefuseTapeContext(
      [
        blockedNoCrack('2026-07-21T06:00:00.000Z', 10),
        blockedNoCrack('2026-07-21T07:00:00.000Z', 10),
        blockedNoCrack('2026-07-21T08:00:00.000Z', 10),
      ],
      '2026-07-21T08:36:00.000Z',
    );
    assert.equal(
      isWeakCrackVsBlocked({ foundingLength: 7, foundingSpeedMin: 40, confluence: 10 }, ctx),
      true,
    );
    assert.equal(
      isWeakCrackVsBlocked({ foundingLength: 7, foundingSpeedMin: 40, confluence: 15 }, ctx),
      false,
    );
  });

  it('formatToxicCrackAdvisory uses block vs would_skip prefixes', () => {
    const geometry = { foundingLength: 7, foundingSpeedMin: 40, confluence: 12 };
    const ctx = buildRefuseTapeContext(
      [
        blockedNoCrack('2026-07-21T06:00:00.000Z'),
        blockedNoCrack('2026-07-21T07:00:00.000Z'),
        blockedNoCrack('2026-07-21T08:00:00.000Z'),
      ],
      '2026-07-21T08:36:00.000Z',
    );
    assert.match(formatToxicCrackAdvisory(geometry, ctx, 'block'), /^ALPHAOMEGA_TOXIC_CRACK:/);
    assert.match(
      formatToxicCrackAdvisory(geometry, ctx, 'would_skip'),
      /^ALPHAOMEGA_TOXIC_CRACK_SHADOW:/,
    );
  });
});
