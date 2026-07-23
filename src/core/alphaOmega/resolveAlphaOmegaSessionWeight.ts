/**
 * AO Lane B session sizing — Omega Asian window 21:00–08:00 UTC.
 * Same hour rule as getSessionLabel('Asian') / dashboard Omega window label.
 *
 * Asia risk cut is applied AFTER the pure-units fillability cap (not inside
 * calculateUnits), so tiny-SL tickets that hit 3M still shrink in Asia.
 */

import { ALPHAOMEGA_ASIAN_SESSION_WEIGHT } from './alphaOmegaConstants.js';

/** True when UTC hour is in [21:00, 24:00) ∪ [00:00, 08:00). */
export function isAlphaOmegaAsianSessionUtc(asOf: Date): boolean {
  const hour = asOf.getUTCHours();
  return hour >= 21 || hour < 8;
}

/**
 * Post-cap Asia scale factor.
 * Asia → ALPHAOMEGA_ASIAN_SESSION_WEIGHT / engineWeight (e.g. 0.10/0.25 = 0.40).
 * Else → 1 (no change).
 */
export function resolveAlphaOmegaAsiaPostCapScale(
  engineWeight: number,
  asOf: Date,
): number {
  if (!isAlphaOmegaAsianSessionUtc(asOf)) return 1;
  if (!(engineWeight > 0) || !Number.isFinite(engineWeight)) return 1;
  return ALPHAOMEGA_ASIAN_SESSION_WEIGHT / engineWeight;
}
