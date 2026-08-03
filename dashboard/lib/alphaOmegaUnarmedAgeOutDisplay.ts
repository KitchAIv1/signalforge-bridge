/**
 * Display-only helpers for unarmed age-out UX.
 * Mirrors bridge hygiene rule — does NOT change trading logic.
 */

import type { AlphaOmegaStreakSnapshot } from '@/lib/alphaOmegaLiveStateMap';
import { describeArmingStatus } from '@/lib/alphaOmegaStreakDisplay';
import { ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN } from '@/lib/omegaLaneBConstants';

export type StreakRadarTone =
  | 'armed'
  | 'arming'
  | 'too_slow'
  | 'idle'
  | 'reset_pending';

/** True when next fire would reset this unarmed streak (wall age > 45m). */
export function isUnarmedAgeOutResetPending(input: {
  armed: boolean;
  streakLength: number;
  wallAgeMin: number | null;
  ageOutEnabled: boolean;
}): boolean {
  if (!input.ageOutEnabled) return false;
  if (input.armed) return false;
  if (input.streakLength <= 0) return false;
  if (input.wallAgeMin == null) return false;
  return input.wallAgeMin > ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN;
}

export function unarmedAgeOutResetReason(wallAgeMin: number): string {
  const ageLabel = `${wallAgeMin.toFixed(0)}m`;
  return (
    `Unarmed ${ageLabel} > ${ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN}m — ` +
    `next same-dir fire restarts at 1/7`
  );
}

/** Missing / null config → ON (matches bridge default). */
export function parseUnarmedAgeOutEnabled(configValue: unknown): boolean {
  if (configValue === false || configValue === 'false') return false;
  return true;
}

/** Overlay RESET PENDING on arming status when age-out applies. */
export function resolveStreakRadarStatus(input: {
  streak: AlphaOmegaStreakSnapshot;
  foundingMin: number | null;
  wallAgeMin: number | null;
  ageOutEnabled: boolean;
}): { badge: string; reason: string | null; tone: StreakRadarTone } {
  const resetPending = isUnarmedAgeOutResetPending({
    armed: input.streak.armed,
    streakLength: input.streak.currentStreakLength,
    wallAgeMin: input.wallAgeMin,
    ageOutEnabled: input.ageOutEnabled,
  });
  if (resetPending && input.wallAgeMin != null) {
    return {
      badge: 'RESET PENDING',
      reason: unarmedAgeOutResetReason(input.wallAgeMin),
      tone: 'reset_pending',
    };
  }
  return describeArmingStatus(input.streak, input.foundingMin);
}
