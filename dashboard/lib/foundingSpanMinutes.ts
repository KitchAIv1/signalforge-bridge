/**
 * Founding span used by live AO arming: minutes from streak start → last fire.
 * Quiet gaps after the last fire do not consume the 45m ceiling.
 */

export function foundingSpanMinutes(
  streakStartAt: string | null | undefined,
  lastFireAt: string | null | undefined,
): number | null {
  if (!streakStartAt || !lastFireAt) return null;
  const startMs = new Date(streakStartAt).getTime();
  const lastMs = new Date(lastFireAt).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(lastMs)) return null;
  return Math.max(0, (lastMs - startMs) / 60_000);
}
