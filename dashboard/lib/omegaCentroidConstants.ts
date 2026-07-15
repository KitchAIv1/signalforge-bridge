/**
 * DISPLAY MIRROR of SIGNALFORGE/engine-omega frozen w5/c0 centroid.
 * Read-only for Centroid Check UI — does NOT drive live matching.
 * Live source of truth: engine-omega/src/shadow/patternMatcher.ts
 * Freeze: Jun 18 2026 AUDUSD 183d mining (w5 cluster 0).
 */

/** Live pattern id written to omega_shadow_signals.pattern_id */
export const OMEGA_CENTROID_PATTERN_ID = 'omega_AUDUSD_M5_w5_c0';

export const OMEGA_CENTROID_PAIR = 'AUDUSD';
export const OMEGA_CENTROID_TIMEFRAME = 'M5';
export const OMEGA_CENTROID_WINDOW_BARS = 5;
export const OMEGA_CENTROID_FEATURE_DIM = 5;

/** ISO date (UTC) of the mining cutover that froze this template. */
export const OMEGA_CENTROID_FREEZE_ISO = '2026-06-18T00:00:00.000Z';

/**
 * Frozen DTW barycenter (25 floats) — must stay in lockstep with
 * FROZEN_W5_C0_CENTROID in engine-omega patternMatcher.ts.
 */
export const OMEGA_FROZEN_W5_C0_CENTROID: readonly number[] = Object.freeze([
  -0.289126, 0.258107, 0.286611, 1.169745, -0.291506,
  0.176524, 0.296873, 0.309273, 0.996103, 0.163589,
  -0.615531, 0.270645, 0.301022, 1.281313, -0.691627,
  1.186027, 0.2789, 0.234096, 1.712694, 1.197718,
  0.839179, 0.293149, 0.263673, 1.505248, 0.841675,
]);

/** Default match threshold (p90 of cluster-0 member distances at mining). */
export const OMEGA_CENTROID_DEFAULT_THRESHOLD = 7.737647;

export const OMEGA_CENTROID_FEATURE_LABELS = [
  'body',
  'upper wick',
  'lower wick',
  'range',
  'close ret',
] as const;

export const OMEGA_CENTROID_HEALTH_REFRESH_MS = 30_000;
export const OMEGA_CENTROID_RECENT_LIMIT = 80;
export const OMEGA_CENTROID_LOOKBACK_DAYS = 30;
