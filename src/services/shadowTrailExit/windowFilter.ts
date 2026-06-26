/** Session windows + hybrid direction filters for shadow Trail v1. */

import type { WindowFilterResult } from './types.js';

const ASIAN_END_MIN = 8 * 60;
const DIST_LOOSE_START_MIN = 10 * 60 + 31;
const DIST_LOOSE_END_MIN = 16 * 60;

function utcMinutes(iso: string): number {
  const date = new Date(iso);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function normalizeDir(raw: string | null | undefined): 'long' | 'short' | null {
  const value = String(raw ?? '').toLowerCase();
  if (value === 'long' || value === 'short') return value;
  return null;
}

export function classifySessionWindow(firedAtIso: string): WindowFilterResult['sessionWindow'] {
  const mins = utcMinutes(firedAtIso);
  if (mins < ASIAN_END_MIN) return 'asian';
  if (mins >= DIST_LOOSE_START_MIN && mins < DIST_LOOSE_END_MIN) return 'dist_loose';
  return 'outside';
}

export function evaluateWindowFilter(
  firedAtIso: string,
  signalDirection: 'long' | 'short',
  omegaDirection: string | null,
  _amdDecisionDirection: string | null,
): WindowFilterResult {
  const sessionWindow = classifySessionWindow(firedAtIso);
  if (sessionWindow === 'outside') {
    return {
      sessionWindow,
      filterPassed: false,
      filterReason: 'outside_session_window',
      expectedDirection: null,
    };
  }
  if (sessionWindow === 'dist_loose') {
    return {
      sessionWindow,
      filterPassed: true,
      filterReason: null,
      expectedDirection: null,
    };
  }
  const expected = normalizeDir(omegaDirection);
  if (!expected) {
    return {
      sessionWindow,
      filterPassed: false,
      filterReason: 'no_asian_direction',
      expectedDirection: null,
    };
  }
  if (signalDirection !== expected) {
    return {
      sessionWindow,
      filterPassed: false,
      filterReason: 'direction_mismatch',
      expectedDirection: expected,
    };
  }
  return {
    sessionWindow,
    filterPassed: true,
    filterReason: null,
    expectedDirection: expected,
  };
}

export function utcTradeDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
