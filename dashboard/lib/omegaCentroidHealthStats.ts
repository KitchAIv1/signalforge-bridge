/**
 * Pure health rollups from fired omega_shadow_signals rows (read-only).
 * Note: the shadow table only stores matches — this is fire telemetry, not
 * bar-by-bar match rate (that needs the offline drift script).
 */

import { OMEGA_CENTROID_DEFAULT_THRESHOLD } from '@/lib/omegaCentroidConstants';

export interface CentroidFireSample {
  id: string;
  firedAt: string;
  direction: string;
  centroidDistance: number;
  confidence: number;
  session: string;
  finalOutcome: string | null;
}

export interface OmegaCentroidHealthStats {
  sampleCount: number;
  fireCount7d: number;
  fireCount30d: number;
  lastFireAt: string | null;
  hoursSinceLastFire: number | null;
  avgDistance: number | null;
  p50Distance: number | null;
  p90Distance: number | null;
  shareNearCeiling: number | null;
  shareComfortable: number | null;
  thresholdUsed: number;
}

function hoursBetween(fromIso: string, toMs: number): number {
  return Math.max(0, (toMs - Date.parse(fromIso)) / 3_600_000);
}

function percentile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function countSince(fires: readonly CentroidFireSample[], sinceMs: number): number {
  return fires.filter((fire) => Date.parse(fire.firedAt) >= sinceMs).length;
}

export function computeOmegaCentroidHealthStats(
  fires: readonly CentroidFireSample[],
  nowMs: number = Date.now(),
  threshold: number = OMEGA_CENTROID_DEFAULT_THRESHOLD,
): OmegaCentroidHealthStats {
  const distances = fires
    .map((fire) => fire.centroidDistance)
    .filter((distance) => Number.isFinite(distance))
    .sort((a, b) => a - b);

  const lastFireAt = fires[0]?.firedAt ?? null;
  const nearCeiling = distances.filter((d) => d >= threshold * 0.9).length;
  const comfortable = distances.filter((d) => d < threshold * 0.5).length;

  return {
    sampleCount: fires.length,
    fireCount7d: countSince(fires, nowMs - 7 * 86_400_000),
    fireCount30d: countSince(fires, nowMs - 30 * 86_400_000),
    lastFireAt,
    hoursSinceLastFire: lastFireAt != null ? hoursBetween(lastFireAt, nowMs) : null,
    avgDistance: mean(distances),
    p50Distance: percentile(distances, 0.5),
    p90Distance: percentile(distances, 0.9),
    shareNearCeiling:
      distances.length > 0 ? nearCeiling / distances.length : null,
    shareComfortable:
      distances.length > 0 ? comfortable / distances.length : null,
    thresholdUsed: threshold,
  };
}

export function formatDistance(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toFixed(3);
}

export function formatSharePct(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(0)}%`;
}

export function distanceToneClass(
  distance: number,
  threshold: number,
): string {
  const ratio = distance / threshold;
  if (ratio >= 0.9) return 'text-amber-700 dark:text-amber-300';
  if (ratio >= 0.7) return 'text-slate-700 dark:text-slate-200';
  return 'text-emerald-700 dark:text-emerald-300';
}
