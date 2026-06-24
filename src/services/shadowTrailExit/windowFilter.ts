/** Session windows + direction filters for shadow Trail v1. */

import type { WindowFilterResult } from './types.js';

const ASIAN_END_MIN = 8 * 60;
const AMD_START_MIN = 10 * 60 + 30;
const AMD_END_MIN = 13 * 60;

function utcMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function normalizeDir(raw: string | null | undefined): 'long' | 'short' | null {
  const v = String(raw ?? '').toLowerCase();
  if (v === 'long' || v === 'short') return v;
  return null;
}

export function classifySessionWindow(firedAtIso: string): WindowFilterResult['sessionWindow'] {
  const mins = utcMinutes(firedAtIso);
  if (mins < ASIAN_END_MIN) return 'asian';
  if (mins >= AMD_START_MIN && mins < AMD_END_MIN) return 'amd_distribution';
  return 'outside';
}

export function evaluateWindowFilter(
  firedAtIso: string,
  signalDirection: 'long' | 'short',
  omegaDirection: string | null,
  amdDecisionDirection: string | null,
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
  const expected =
    sessionWindow === 'asian'
      ? normalizeDir(omegaDirection)
      : normalizeDir(amdDecisionDirection);
  if (!expected) {
    return {
      sessionWindow,
      filterPassed: false,
      filterReason: sessionWindow === 'asian' ? 'no_asian_direction' : 'no_amd_verdict',
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
