/**
 * Hybrid entry gate (Trail v1 deployable policy):
 *   Asian 00:00–08:00 UTC — direction must match omega_direction
 *   Distribution 10:31–16:00 UTC — time window only, direction ungated (DTW as fired)
 */

export type HybridSessionWindow = 'asian' | 'dist_loose' | 'outside';

const ASIAN_END_MIN = 8 * 60;
const DIST_LOOSE_START_MIN = 10 * 60 + 31;
const DIST_LOOSE_END_MIN = 16 * 60;

export interface HybridEntryGateResult {
  passed: boolean;
  reason: string | null;
  session: HybridSessionWindow;
}

function utcMinutes(iso: string): number {
  const date = new Date(iso);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function normalizeDir(raw: string | null | undefined): 'long' | 'short' | null {
  const value = String(raw ?? '').toLowerCase();
  if (value === 'long' || value === 'short') return value;
  return null;
}

export function classifyHybridSessionWindow(firedAtIso: string): HybridSessionWindow {
  const mins = utcMinutes(firedAtIso);
  if (mins < ASIAN_END_MIN) return 'asian';
  if (mins >= DIST_LOOSE_START_MIN && mins < DIST_LOOSE_END_MIN) return 'dist_loose';
  return 'outside';
}

export function isHybridDistLooseSession(firedAtIso: string): boolean {
  return classifyHybridSessionWindow(firedAtIso) === 'dist_loose';
}

export function evaluateHybridEntryGate(
  firedAtIso: string,
  signalDirection: string,
  omegaDirection: string | null,
): HybridEntryGateResult {
  const session = classifyHybridSessionWindow(firedAtIso);
  if (session === 'outside') {
    return { passed: false, reason: 'OMEGA_OUTSIDE_HYBRID_WINDOW', session };
  }
  if (session === 'dist_loose') {
    return { passed: true, reason: null, session };
  }
  const expected = normalizeDir(omegaDirection);
  if (!expected) {
    return { passed: false, reason: 'OMEGA_NO_ASIAN_DIRECTION', session };
  }
  const signalDir = normalizeDir(signalDirection);
  if (signalDir !== expected) {
    return { passed: false, reason: 'OMEGA_ASIAN_DIRECTION_MISMATCH', session };
  }
  return { passed: true, reason: null, session };
}
