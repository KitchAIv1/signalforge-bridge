import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { walkSpeedfloorPaperExit } from './walkSpeedfloorPaperExit';
import type { PaperCandle, PaperFire } from './paperSimTypes';

function candle(time: string, h: number, l: number, c: number): PaperCandle {
  return { time, h, l, c };
}

describe('walkSpeedfloorPaperExit', () => {
  it('hard-stops LONG after adverse M5 excursion', () => {
    const candles = [
      candle('2026-07-24T12:20:00.000Z', 0.6505, 0.6490, 0.6492),
      candle('2026-07-24T12:25:00.000Z', 0.6495, 0.6485, 0.6486),
    ];
    const walk = walkSpeedfloorPaperExit({
      direction: 'LONG',
      entryAt: '2026-07-24T12:16:00.000Z',
      entryPrice: 0.65,
      candles,
      firesAfterEntry: [],
      givebackEnabled: false,
      nowMs: Date.parse('2026-07-24T16:00:00.000Z'),
    });
    assert.equal(walk.open, false);
    assert.equal(walk.trigger, 'hard_stop');
  });

  it('exits on opposing share when first 4 fires are all opposing', () => {
    const entry = '2026-07-24T10:00:00.000Z';
    const fires: PaperFire[] = [];
    for (let i = 1; i <= 4; i += 1) {
      fires.push({
        signalId: `opp-${i}`,
        direction: 'SHORT',
        firedAt: `2026-07-24T10:${String(i * 5).padStart(2, '0')}:00.000Z`,
        markPrice: 0.6495,
      });
    }
    const walk = walkSpeedfloorPaperExit({
      direction: 'LONG',
      entryAt: entry,
      entryPrice: 0.65,
      candles: [candle('2026-07-24T10:00:00.000Z', 0.6502, 0.6498, 0.65)],
      firesAfterEntry: fires,
      givebackEnabled: false,
      nowMs: Date.parse('2026-07-24T14:00:00.000Z'),
    });
    assert.equal(walk.trigger, 'opposing_share');
    assert.equal(walk.open, false);
  });
});
