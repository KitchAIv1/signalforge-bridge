import type { LiveExecution, OmegaInverseStats, ShadowSignal } from '@/lib/omegaInverseTypes';

type DirectionSide = 'long' | 'short';

export function parseOmegaDirectionValue(raw: unknown): DirectionSide | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.toLowerCase().trim();
  if (normalized === 'long' || normalized === 'short') return normalized;
  return null;
}

/**
 * Derives the original DTW signal direction by inverting execution direction.
 * Valid assumption: Omega Inverse always executes the opposite of DTW signal.
 * KNOWN LIMITATION: if SHORT→LONG inversion goes live in future,
 * this derivation still holds (exec=LONG → DTW=SHORT) but becomes
 * harder to reason about. At that point, store dtw_direction as a
 * dedicated column in bridge_trade_log instead of deriving it.
 */
export function deriveDtwDirection(execDirection: string): DirectionSide {
  const normalized = execDirection.toLowerCase();
  return normalized === 'long' ? 'short' : 'long';
}

export function isTodayUtc(isoTimestamp: string): boolean {
  const todayUtc = new Date().toISOString().slice(0, 10);
  return isoTimestamp.slice(0, 10) === todayUtc;
}

export function formatUtcTime(isoTimestamp: string | null): string {
  if (isoTimestamp == null) return '—';
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toISOString().slice(11, 16);
}

export function formatDirectionLabel(direction: string): string {
  return direction.toLowerCase() === 'long' ? 'LONG' : 'SHORT';
}

export function computeOmegaInverseStats(
  liveExecutions: LiveExecution[],
  shadowSignals: ShadowSignal[],
): OmegaInverseStats {
  const totalExecuted = liveExecutions.filter(
    (row) => row.decision === 'EXECUTED' && row.direction.toLowerCase() === 'short',
  ).length;
  const totalBlocked = liveExecutions.filter((row) => row.decision === 'BLOCKED').length;
  return {
    totalLiveSignals: totalExecuted + totalBlocked,
    totalExecuted,
    totalBlocked,
    totalShadow: shadowSignals.length,
    longToShortCount: totalExecuted,
    shortToLongCount: shadowSignals.length,
  };
}
