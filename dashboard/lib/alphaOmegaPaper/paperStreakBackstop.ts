/**
 * Minimal post-entry streak for paper backstop (same arm rules as live).
 * Display-only — does not touch live streak state.
 */

import {
  PAPER_ARM_CEILING_MIN,
  PAPER_MAX_GAP_MIN,
  PAPER_STREAK_LEN,
} from './paperSimConstants';
import type { PaperFire } from './paperSimTypes';

export interface PaperStreakState {
  direction: 'LONG' | 'SHORT' | null;
  length: number;
  startAt: string | null;
  lastAt: string | null;
  armed: boolean;
  armedDirection: 'LONG' | 'SHORT' | null;
}

export function emptyPaperStreak(): PaperStreakState {
  return {
    direction: null,
    length: 0,
    startAt: null,
    lastAt: null,
    armed: false,
    armedDirection: null,
  };
}

function minutesBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 60_000;
}

/** Returns true when this fire is a backstop crack vs entry direction. */
export function applyFireForPaperBackstop(
  state: PaperStreakState,
  fire: PaperFire,
  entryDirection: 'LONG' | 'SHORT',
): { next: PaperStreakState; backstop: boolean } {
  const gap = state.lastAt ? minutesBetween(state.lastAt, fire.firedAt) : 0;
  const continues = fire.direction === state.direction && gap <= PAPER_MAX_GAP_MIN;
  const nextDirection = continues ? state.direction! : fire.direction;
  const nextLength = continues ? state.length + 1 : 1;
  const nextStart = continues ? state.startAt! : fire.firedAt;

  let backstop = false;
  if (
    state.armed &&
    state.armedDirection === entryDirection &&
    fire.direction !== entryDirection
  ) {
    backstop = true;
  }

  let armed = backstop ? false : state.armed;
  let armedDirection = backstop ? null : state.armedDirection;
  if (!armed && nextLength >= PAPER_STREAK_LEN) {
    const duration = minutesBetween(nextStart, fire.firedAt);
    if (duration >= 0 && duration <= PAPER_ARM_CEILING_MIN) {
      armed = true;
      armedDirection = nextDirection;
    }
  }

  return {
    next: {
      direction: nextDirection,
      length: nextLength,
      startAt: nextStart,
      lastAt: fire.firedAt,
      armed,
      armedDirection,
    },
    backstop,
  };
}
