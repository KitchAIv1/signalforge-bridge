/**
 * Parse ALPHAOMEGA lane_advisory / block_reason strings written by the live gate.
 * Legacy R1/Phase2 advisories are handled in phase2LaneAdvisoryFormat.ts.
 */

export const ALPHAOMEGA_BLOCK_NO_CRACK = 'ALPHAOMEGA_NO_QUALIFYING_CRACK';
export const ALPHAOMEGA_BLOCK_SPEED_FLOOR = 'ALPHAOMEGA_SPEED_FLOOR';
export const ALPHAOMEGA_BLOCK_SPEED_MID_BAND = 'ALPHAOMEGA_SPEED_MID_BAND';
export const ALPHAOMEGA_BLOCK_ALREADY_OPEN = 'ALPHAOMEGA_ALREADY_OPEN';
export const ALPHAOMEGA_BLOCK_ENTRY_BLACKOUT = 'ALPHAOMEGA_ENTRY_BLACKOUT';
export const ALPHAOMEGA_BLOCK_INVALID_DIRECTION = 'ALPHAOMEGA_INVALID_DIRECTION';
/** Combined Stack — live AO blocked on AMD_FAILED day after tag write. */
export const ALPHAOMEGA_BLOCK_AMD_DAY_GATE = 'ALPHAOMEGA_AMD_DAY_GATE';

export const ALPHAOMEGA_ADVISORY_ENTRY_PREFIX = 'ALPHAOMEGA_ENTRY:';
/** Shadow AO paper fill advisory (ao_shadow_paper) — not a live broker entry. */
export const ALPHAOMEGA_ADVISORY_SHADOW_ENTRY_PREFIX = 'ALPHAOMEGA_SHADOW_ENTRY';
export const ALPHAOMEGA_ADVISORY_SPEEDFLOOR_PREFIX = 'ALPHAOMEGA_SPEEDFLOOR_SHADOW:';
export const ALPHAOMEGA_ADVISORY_SPEEDBAND_PREFIX = 'ALPHAOMEGA_SPEEDBAND_SHADOW:';
export const ALPHAOMEGA_ADVISORY_DISABLED = 'ALPHAOMEGA_DISABLED_FALLBACK';

export interface AlphaOmegaFoundingMeta {
  foundingLength: number | null;
  foundingSpeedMin: number | null;
  wouldEnterDirection: string | null;
}

const BLOCK_REASON_LABELS: Record<string, string> = {
  [ALPHAOMEGA_BLOCK_NO_CRACK]: 'No qualifying crack',
  [ALPHAOMEGA_BLOCK_SPEED_FLOOR]: 'Speed floor',
  [ALPHAOMEGA_BLOCK_SPEED_MID_BAND]: 'Speed mid-band (45–60)',
  [ALPHAOMEGA_BLOCK_ALREADY_OPEN]: 'Already open',
  [ALPHAOMEGA_BLOCK_ENTRY_BLACKOUT]: 'Asia open blackout',
  [ALPHAOMEGA_BLOCK_INVALID_DIRECTION]: 'Invalid direction',
  [ALPHAOMEGA_BLOCK_AMD_DAY_GATE]: 'AMD day gate',
};

export function formatAlphaOmegaBlockReason(blockReason: string | null | undefined): string {
  if (!blockReason) return '—';
  return BLOCK_REASON_LABELS[blockReason] ?? blockReason;
}

export function parseAlphaOmegaFoundingMeta(
  laneAdvisory: string | null | undefined,
): AlphaOmegaFoundingMeta {
  const empty: AlphaOmegaFoundingMeta = {
    foundingLength: null,
    foundingSpeedMin: null,
    wouldEnterDirection: null,
  };
  const text = (laneAdvisory ?? '').trim();
  if (!text) return empty;

  const lengthMatch = text.match(/len=(\d+)/);
  const speedMatch = text.match(/speed=([\d.]+)m/);
  const wouldMatch = text.match(/would_enter:(LONG|SHORT)/i);

  return {
    foundingLength: lengthMatch ? Number(lengthMatch[1]) : null,
    foundingSpeedMin: speedMatch ? Number(speedMatch[1]) : null,
    wouldEnterDirection: wouldMatch ? wouldMatch[1].toUpperCase() : null,
  };
}

export function formatFoundingSummary(meta: AlphaOmegaFoundingMeta): string | null {
  if (meta.foundingLength == null && meta.foundingSpeedMin == null) return null;
  const lengthPart = meta.foundingLength != null ? String(meta.foundingLength) : '?';
  const speedPart =
    meta.foundingSpeedMin != null ? `${meta.foundingSpeedMin.toFixed(1)}m` : '?';
  return `${lengthPart} @ ${speedPart}`;
}

export function isAlphaOmegaSpeedFloorAdvisory(laneAdvisory: string | null | undefined): boolean {
  return (laneAdvisory ?? '').trim().startsWith(ALPHAOMEGA_ADVISORY_SPEEDFLOOR_PREFIX);
}

/** CF-C mid-band forensics shadow — not SPEEDFLOOR paper. */
export function isAlphaOmegaSpeedBandAdvisory(laneAdvisory: string | null | undefined): boolean {
  return (laneAdvisory ?? '').trim().startsWith(ALPHAOMEGA_ADVISORY_SPEEDBAND_PREFIX);
}

export function isAlphaOmegaEntryAdvisory(laneAdvisory: string | null | undefined): boolean {
  return (laneAdvisory ?? '').trim().startsWith(ALPHAOMEGA_ADVISORY_ENTRY_PREFIX);
}

export function isAlphaOmegaShadowEntryAdvisory(
  laneAdvisory: string | null | undefined,
): boolean {
  return (laneAdvisory ?? '').trim().startsWith(ALPHAOMEGA_ADVISORY_SHADOW_ENTRY_PREFIX);
}

/** Human detail from bridge lane_advisory AMD_DAY_GATE:tag=…:taggedAt=… */
export function formatAmdDayGateAdvisoryDetail(
  laneAdvisory: string | null | undefined,
): string | null {
  const text = (laneAdvisory ?? '').trim();
  if (!text.startsWith('AMD_DAY_GATE:')) return null;
  const tagMatch = text.match(/tag=([^:]+)/);
  // ISO timestamps contain ':' — capture through :block (or end).
  const taggedAtMatch = text.match(/taggedAt=(.+?)(?::block|$)/);
  const tag = tagMatch?.[1] ?? 'AMD_FAILED';
  if (!taggedAtMatch?.[1]) return `${tag} — Combined Stack gate`;
  const taggedAt = new Date(taggedAtMatch[1]);
  if (Number.isNaN(taggedAt.getTime())) return `${tag} — Combined Stack gate`;
  const hours = String(taggedAt.getUTCHours()).padStart(2, '0');
  const minutes = String(taggedAt.getUTCMinutes()).padStart(2, '0');
  return `${tag} · tagged ${hours}:${minutes} UTC`;
}
