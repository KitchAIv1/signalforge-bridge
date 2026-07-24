import {
  PAPER_OPPOSING_COUNT,
  PAPER_OPPOSING_SHARE,
  PAPER_OPPOSING_SHARE_MIN_FIRES,
} from './paperSimConstants';
import {
  applyFireForPaperBackstop,
  emptyPaperStreak,
  type PaperStreakState,
} from './paperStreakBackstop';
import type { PaperExitTrigger, PaperFire } from './paperSimTypes';

export interface PaperFireExitResult {
  opposing: number;
  totalFires: number;
  streak: PaperStreakState;
  exitAt: string | null;
  exitPrice: number | null;
  trigger: PaperExitTrigger | null;
}

function markPrice(fire: PaperFire, entry: number): number {
  return fire.markPrice ?? entry;
}

function closed(
  fire: PaperFire,
  entry: number,
  trigger: PaperExitTrigger,
  opposing: number,
  totalFires: number,
  streak: PaperStreakState,
): PaperFireExitResult {
  return {
    opposing,
    totalFires,
    streak,
    exitAt: fire.firedAt,
    exitPrice: markPrice(fire, entry),
    trigger,
  };
}

export function tryPaperFireExits(
  direction: 'LONG' | 'SHORT',
  entry: number,
  fire: PaperFire,
  opposingIn: number,
  totalIn: number,
  streakIn: PaperStreakState,
): PaperFireExitResult {
  const { next, backstop } = applyFireForPaperBackstop(streakIn, fire, direction);
  if (backstop) {
    return closed(fire, entry, 'backstop_crack', opposingIn, totalIn, next);
  }

  let opposing = opposingIn;
  const totalFires = totalIn + 1;
  if (fire.direction !== direction) opposing += 1;

  if (opposing >= PAPER_OPPOSING_COUNT) {
    return closed(fire, entry, 'opposing_count', opposing, totalFires, next);
  }
  if (
    totalFires >= PAPER_OPPOSING_SHARE_MIN_FIRES &&
    opposing / totalFires >= PAPER_OPPOSING_SHARE
  ) {
    return closed(fire, entry, 'opposing_share', opposing, totalFires, next);
  }
  return {
    opposing,
    totalFires,
    streak: next,
    exitAt: null,
    exitPrice: null,
    trigger: null,
  };
}

export { emptyPaperStreak };
