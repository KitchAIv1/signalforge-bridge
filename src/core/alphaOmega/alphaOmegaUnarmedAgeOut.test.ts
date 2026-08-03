import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ENTRY_SPEED_CEILING_MIN } from './alphaOmegaConstants.js';
import { shouldResetUnarmedStreakForAge } from './alphaOmegaUnarmedAgeOut.js';
import {
  emptyStreakState,
  processFireForStreak,
  type StreakState,
} from './alphaOmegaStreakTracker.js';

const T0 = '2026-08-03T10:00:00.000Z';

function atMinutes(startIso: string, minutes: number): string {
  return new Date(Date.parse(startIso) + minutes * 60_000).toISOString();
}

function unarmedPartial(len: number, startAt: string, lastAt: string): StreakState {
  return {
    ...emptyStreakState(),
    currentStreakDirection: 'LONG',
    currentStreakLength: len,
    currentStreakStartAt: startAt,
    lastFireAt: lastAt,
    armed: false,
    armedDirection: null,
  };
}

describe('shouldResetUnarmedStreakForAge', () => {
  it('false when armed even if age > 45', () => {
    assert.equal(
      shouldResetUnarmedStreakForAge({
        armed: true,
        streakStartAt: T0,
        fireAt: atMinutes(T0, 50),
      }),
      false,
    );
  });

  it('false at exactly 45.0 (arm ceiling still eligible)', () => {
    assert.equal(
      shouldResetUnarmedStreakForAge({
        armed: false,
        streakStartAt: T0,
        fireAt: atMinutes(T0, ENTRY_SPEED_CEILING_MIN),
      }),
      false,
    );
  });

  it('true when unarmed and age > 45', () => {
    assert.equal(
      shouldResetUnarmedStreakForAge({
        armed: false,
        streakStartAt: T0,
        fireAt: atMinutes(T0, 45.1),
      }),
      true,
    );
  });

  it('false when kill switch disabled', () => {
    assert.equal(
      shouldResetUnarmedStreakForAge({
        armed: false,
        streakStartAt: T0,
        fireAt: atMinutes(T0, 60),
        enabled: false,
      }),
      false,
    );
  });
});

describe('processFireForStreak — unarmed age-out', () => {
  it('resets unarmed zombie to len=1 when age > 45', () => {
    const state = unarmedPartial(5, T0, atMinutes(T0, 40));
    const { nextState, crack } = processFireForStreak(state, {
      direction: 'LONG',
      firedAt: atMinutes(T0, 50),
      signalId: 'age-out-1',
    });
    assert.equal(crack, null);
    assert.equal(nextState.currentStreakLength, 1);
    assert.equal(nextState.currentStreakStartAt, atMinutes(T0, 50));
    assert.equal(nextState.armed, false);
  });

  it('does not reset at age exactly 45 — continues and can still grow', () => {
    const state = unarmedPartial(5, T0, atMinutes(T0, 40));
    const { nextState } = processFireForStreak(state, {
      direction: 'LONG',
      firedAt: atMinutes(T0, 45),
      signalId: 'edge-45',
    });
    assert.equal(nextState.currentStreakLength, 6);
    assert.equal(nextState.currentStreakStartAt, T0);
  });

  it('never resets an armed streak by age', () => {
    const state: StreakState = {
      ...emptyStreakState(),
      currentStreakDirection: 'SHORT',
      currentStreakLength: 10,
      currentStreakStartAt: T0,
      lastFireAt: atMinutes(T0, 40),
      armed: true,
      armedDirection: 'SHORT',
    };
    const { nextState, crack } = processFireForStreak(state, {
      direction: 'SHORT',
      firedAt: atMinutes(T0, 90),
      signalId: 'armed-continue',
    });
    assert.equal(crack, null);
    assert.equal(nextState.armed, true);
    assert.equal(nextState.currentStreakLength, 11);
    assert.equal(nextState.currentStreakStartAt, T0);
  });

  it('still cracks an armed streak on opposite fire after long age', () => {
    const state: StreakState = {
      ...emptyStreakState(),
      currentStreakDirection: 'SHORT',
      currentStreakLength: 9,
      currentStreakStartAt: T0,
      lastFireAt: atMinutes(T0, 40),
      armed: true,
      armedDirection: 'SHORT',
    };
    const { nextState, crack } = processFireForStreak(state, {
      direction: 'LONG',
      firedAt: atMinutes(T0, 100),
      signalId: 'armed-crack',
    });
    assert.ok(crack);
    assert.equal(crack!.brokenDirection, 'SHORT');
    assert.equal(crack!.enterDirection, 'LONG');
    assert.equal(nextState.armed, false);
    assert.equal(nextState.currentStreakLength, 1);
  });

  it('kill switch off preserves legacy continue past 45m unarmed', () => {
    const state = unarmedPartial(5, T0, atMinutes(T0, 40));
    const { nextState } = processFireForStreak(
      state,
      { direction: 'LONG', firedAt: atMinutes(T0, 50), signalId: 'legacy' },
      { unarmedAgeOutEnabled: false },
    );
    assert.equal(nextState.currentStreakLength, 6);
    assert.equal(nextState.currentStreakStartAt, T0);
  });

  it('gap >60 still breaks streak independently of age-out', () => {
    const state = unarmedPartial(3, T0, atMinutes(T0, 10));
    const { nextState } = processFireForStreak(state, {
      direction: 'LONG',
      firedAt: atMinutes(T0, 10 + 61),
      signalId: 'gap-break',
    });
    assert.equal(nextState.currentStreakLength, 1);
    assert.equal(nextState.currentStreakStartAt, atMinutes(T0, 71));
  });
});
