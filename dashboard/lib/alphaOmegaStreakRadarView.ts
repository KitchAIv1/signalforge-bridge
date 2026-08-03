/**
 * Display-only view model for Streak radar (no trading logic).
 */

import type { AlphaOmegaStreakSnapshot } from '@/lib/alphaOmegaLiveStateMap';
import {
  foundingSpanMinutes,
  minutesSinceIso,
  streakThresholdSlots,
} from '@/lib/alphaOmegaStreakDisplay';
import {
  resolveStreakRadarStatus,
  type StreakRadarTone,
} from '@/lib/alphaOmegaUnarmedAgeOutDisplay';
import { ALPHAOMEGA_ENTRY_STREAK_LENGTH } from '@/lib/omegaLaneBConstants';

export interface StreakRadarViewModel {
  dirLabel: string;
  length: number;
  foundingMin: number | null;
  wallAgeMin: number | null;
  filledSlots: number;
  overflow: number;
  badge: string;
  reason: string | null;
  tone: StreakRadarTone;
  railAccent: 'amber' | 'rose' | 'sky';
  meterAlert: boolean;
  showResetHint: boolean;
}

export function buildStreakRadarView(
  streak: AlphaOmegaStreakSnapshot,
  nowMs: number,
  ageOutEnabled: boolean,
): StreakRadarViewModel {
  const length = streak.currentStreakLength;
  const foundingMin = foundingSpanMinutes(
    streak.currentStreakStartAt,
    streak.lastFireAt,
  );
  const wallAgeMin = minutesSinceIso(streak.currentStreakStartAt, nowMs);
  const slots = streakThresholdSlots(length, ALPHAOMEGA_ENTRY_STREAK_LENGTH);
  const status = resolveStreakRadarStatus({
    streak,
    foundingMin,
    wallAgeMin,
    ageOutEnabled,
  });
  return {
    dirLabel: streak.currentStreakDirection?.toUpperCase() ?? '—',
    length,
    foundingMin,
    wallAgeMin,
    filledSlots: slots.filledSlots,
    overflow: slots.overflow,
    badge: status.badge,
    reason: status.reason,
    tone: status.tone,
    railAccent: pickRailAccent(streak.armed, status.tone),
    meterAlert: status.tone === 'too_slow' || status.tone === 'reset_pending',
    showResetHint: ageOutEnabled && !streak.armed && length > 0,
  };
}

function pickRailAccent(
  armed: boolean,
  tone: StreakRadarTone,
): 'amber' | 'rose' | 'sky' {
  if (armed) return 'amber';
  if (tone === 'too_slow' || tone === 'reset_pending') return 'rose';
  return 'sky';
}
