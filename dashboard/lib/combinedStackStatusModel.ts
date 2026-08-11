/**
 * Pure display model for the Combined Stack status card. Mirrors (never
 * re-implements) bridge gate semantics: AO is gated only when the gate key is
 * on, today's automated amd_tag is AMD_FAILED, and now >= tag write time.
 * Read-only — no engine logic lives here.
 */

export type AoFireStatusVariant =
  | 'firing'
  | 'gated'
  | 'shadow_gated'
  | 'tag_pending'
  | 'gate_off';

export interface AoFireStatus {
  variant: AoFireStatusVariant;
  headline: string;
  detail: string;
}

export interface CombinedStackLever {
  label: string;
  enabled: boolean;
}

export interface AmdTodaySnapshot {
  tag: string | null;
  tagWrittenAtIso: string | null;
  oandaStatus: 'open' | 'closed' | 'none';
  oandaPeakPips: number | null;
  oandaClosedPips: number | null;
  vtFilled: boolean;
  vtArmed: boolean;
}

const BLOCKING_TAG = 'AMD_FAILED';

function formatUtcClock(iso: string): string {
  const parsed = new Date(iso);
  const hours = String(parsed.getUTCHours()).padStart(2, '0');
  const minutes = String(parsed.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes} UTC`;
}

export function deriveAoFireStatus(input: {
  gateEnabled: boolean;
  amdTag: string | null;
  tagWrittenAtIso: string | null;
  nowMs: number;
  gateBlocksToday: number;
}): AoFireStatus {
  const { gateEnabled, amdTag, tagWrittenAtIso, nowMs, gateBlocksToday } = input;
  const tagKnown =
    amdTag != null &&
    tagWrittenAtIso != null &&
    nowMs >= Date.parse(tagWrittenAtIso);

  if (!tagKnown) {
    return {
      variant: gateEnabled ? 'tag_pending' : 'gate_off',
      headline: gateEnabled ? 'AO firing — tag pending' : 'AO firing normally',
      detail: gateEnabled
        ? 'AMD detector tags at 10:31 UTC · gate decides then'
        : 'AMD-day gate is off',
    };
  }

  const isFailedDay = amdTag === BLOCKING_TAG;
  if (!isFailedDay) {
    return {
      variant: 'firing',
      headline: 'AO firing normally',
      detail: `Clean structure day (${amdTag}) — gate passes`,
    };
  }

  if (!gateEnabled) {
    return {
      variant: 'shadow_gated',
      headline: 'AO firing (shadow gate)',
      detail: `AMD_FAILED day — gate off, would block after ${
        tagWrittenAtIso ? formatUtcClock(tagWrittenAtIso) : '10:31 UTC'
      }`,
    };
  }

  const blocksSuffix =
    gateBlocksToday > 0
      ? ` · ${gateBlocksToday} block${gateBlocksToday === 1 ? '' : 's'} today`
      : '';
  return {
    variant: 'gated',
    headline: 'AO gated today',
    detail: `AMD_FAILED tagged ${
      tagWrittenAtIso ? formatUtcClock(tagWrittenAtIso) : '10:31 UTC'
    } — new entries blocked until midnight UTC${blocksSuffix}`,
  };
}

export function formatAmdTodayLine(snapshot: AmdTodaySnapshot): string {
  const oandaPart =
    snapshot.oandaStatus === 'open'
      ? `OPEN${
          snapshot.oandaPeakPips != null
            ? ` · peak +${snapshot.oandaPeakPips.toFixed(1)}p`
            : ''
        }`
      : snapshot.oandaStatus === 'closed'
        ? `CLOSED${
            snapshot.oandaClosedPips != null
              ? ` ${snapshot.oandaClosedPips >= 0 ? '+' : ''}${snapshot.oandaClosedPips.toFixed(1)}p`
              : ''
          }`
        : 'No trade yet';
  const vtPart = snapshot.vtFilled
    ? 'FILLED'
    : snapshot.vtArmed
      ? 'ARMED'
      : 'OFF';
  return `${oandaPart} · VT: ${vtPart}`;
}
