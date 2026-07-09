/**
 * Progress-bar fill percent helpers for ALPHAOMEGA live meters.
 */

export function meterFillPercent(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, (current / target) * 100));
}

export function formatRelativeAge(isoTimestamp: string | null | undefined, nowMs: number): string {
  if (!isoTimestamp) return '—';
  const thenMs = new Date(isoTimestamp).getTime();
  if (Number.isNaN(thenMs)) return '—';
  const deltaSec = Math.max(0, Math.floor((nowMs - thenMs) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m ago`;
  const deltaHr = Math.floor(deltaMin / 60);
  return `${deltaHr}h ${deltaMin % 60}m ago`;
}

export function directionToneClass(direction: string | null | undefined): string {
  const upper = (direction ?? '').toUpperCase();
  if (upper === 'LONG') return 'text-emerald-600 dark:text-emerald-400';
  if (upper === 'SHORT') return 'text-red-600 dark:text-red-400';
  return 'text-slate-500';
}
