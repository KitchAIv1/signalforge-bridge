/**
 * Display-only helpers for ALPHAOMEGA streak radar / open-risk copy.
 * Mirrors live thresholds for labels — does not change trading logic.
 */

import type { AlphaOmegaStreakSnapshot } from '@/lib/alphaOmegaLiveStateMap';
import type { AlphaOmegaOpenPositionSnapshot } from '@/lib/alphaOmegaLiveStateMap';
import {
  ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN,
  ALPHAOMEGA_ENTRY_STREAK_LENGTH,
} from '@/lib/omegaLaneBConstants';
export { foundingSpanMinutes } from '@/lib/foundingSpanMinutes';

export function minutesSinceIso(isoTimestamp: string | null | undefined, nowMs: number): number | null {
  if (!isoTimestamp) return null;
  const thenMs = new Date(isoTimestamp).getTime();
  if (Number.isNaN(thenMs)) return null;
  return Math.max(0, (nowMs - thenMs) / 60_000);
}

export function streakThresholdSlots(length: number, threshold: number): {
  filledSlots: number;
  overflow: number;
} {
  const safeLength = Math.max(0, length);
  const filledSlots = Math.min(safeLength, threshold);
  const overflow = Math.max(0, safeLength - threshold);
  return { filledSlots, overflow };
}

export function armWindowFillPercent(streakAgeMin: number | null): number {
  if (streakAgeMin == null || streakAgeMin < 0) return 0;
  return Math.min(100, (streakAgeMin / ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN) * 100);
}

export function describeArmingStatus(
  streak: AlphaOmegaStreakSnapshot,
  streakAgeMin: number | null,
): { badge: string; reason: string | null; tone: 'armed' | 'arming' | 'too_slow' | 'idle' } {
  if (streak.armed && streak.armedDirection) {
    const dir = streak.armedDirection.toUpperCase();
    return {
      badge: `ARMED for ${dir}`,
      reason: `Waiting for first opposing fire to enter ${dir === 'LONG' ? 'SHORT' : 'LONG'}`,
      tone: 'armed',
    };
  }
  if (streak.currentStreakLength <= 0) {
    return { badge: 'Idle', reason: null, tone: 'idle' };
  }
  const need = Math.max(0, ALPHAOMEGA_ENTRY_STREAK_LENGTH - streak.currentStreakLength);
  if (streak.currentStreakLength >= ALPHAOMEGA_ENTRY_STREAK_LENGTH) {
    const ageLabel = streakAgeMin != null ? `${streakAgeMin.toFixed(0)}m` : '—';
    if (streakAgeMin != null && streakAgeMin <= ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN) {
      return {
        badge: 'Arming',
        reason: `${streak.currentStreakLength}/7 · ${ageLabel} within window — awaiting arm flag`,
        tone: 'arming',
      };
    }
    return {
      badge: 'Arming',
      reason: `${streak.currentStreakLength}/7 · ${ageLabel} > ${ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN}m ceiling — not ARMED`,
      tone: 'too_slow',
    };
  }
  const ageLabel = streakAgeMin != null ? `${streakAgeMin.toFixed(0)}m` : '—';
  return {
    badge: 'Arming',
    reason: `${need} more same-dir · window ${ageLabel} / ${ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN}m`,
    tone: 'arming',
  };
}

export function describeFlatNextNeed(streak: AlphaOmegaStreakSnapshot | null): string {
  if (!streak || streak.currentStreakLength <= 0) {
    return `Next need: ARMED ${ALPHAOMEGA_ENTRY_STREAK_LENGTH} in ≤${ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN}m, then crack`;
  }
  if (streak.armed && streak.armedDirection) {
    const enter = streak.armedDirection.toUpperCase() === 'LONG' ? 'SHORT' : 'LONG';
    return `Next need: opposing fire to crack → enter ${enter}`;
  }
  return `Next need: finish arming (${streak.currentStreakLength}/${ALPHAOMEGA_ENTRY_STREAK_LENGTH} · ≤${ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN}m), then crack`;
}

export function describeOpenRiskBridge(
  openPosition: AlphaOmegaOpenPositionSnapshot,
  streak: AlphaOmegaStreakSnapshot | null,
): string | null {
  if (!streak) return null;
  const posDir = openPosition.direction.toUpperCase();
  if (streak.armed && streak.armedDirection?.toUpperCase() === posDir) {
    return `${posDir} open · streak ARMED — next opposing can backstop-close`;
  }
  if (
    streak.currentStreakLength >= ALPHAOMEGA_ENTRY_STREAK_LENGTH &&
    !streak.armed
  ) {
    return `${posDir} open · streak Arming (too slow to backstop) · opposing ${openPosition.opposingFireCount}/5`;
  }
  return `${posDir} open · streak ${streak.currentStreakLength}/7 · opposing ${openPosition.opposingFireCount}/5`;
}
