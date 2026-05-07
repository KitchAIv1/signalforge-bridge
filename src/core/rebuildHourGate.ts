/**
 * Rebuild live execution — UTC hour gate (bridge only).
 */

export const DEFAULT_REBUILD_BLOCKED_HOURS_UTC: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 14, 15, 19, 20, 21,
];

/** Matches dashboard + DB: OFF only when explicitly false. */
export function parseRebuildHourGateEnabled(raw: unknown): boolean {
  if (raw === false || raw === 'false') return false;
  return true;
}

export function isRebuildHourUtcBlocked(
  hourUtc: number,
  gateEnabled: boolean
): boolean {
  if (!gateEnabled) return false;
  return DEFAULT_REBUILD_BLOCKED_HOURS_UTC.includes(hourUtc);
}
