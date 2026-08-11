import {
  LANE_B_BLOCK_PHASE2_DIST,
  LANE_B_BLOCK_R1_FLIP,
} from './omegaLaneBConstants';
import {
  ALPHAOMEGA_ADVISORY_DISABLED,
  ALPHAOMEGA_ADVISORY_ENTRY_PREFIX,
  ALPHAOMEGA_ADVISORY_SHADOW_ENTRY_PREFIX,
  ALPHAOMEGA_ADVISORY_SPEEDBAND_PREFIX,
  ALPHAOMEGA_ADVISORY_SPEEDFLOOR_PREFIX,
  ALPHAOMEGA_BLOCK_ALREADY_OPEN,
  ALPHAOMEGA_BLOCK_AMD_DAY_GATE,
  ALPHAOMEGA_BLOCK_ENTRY_BLACKOUT,
  ALPHAOMEGA_BLOCK_INVALID_DIRECTION,
  ALPHAOMEGA_BLOCK_NO_CRACK,
  ALPHAOMEGA_BLOCK_SPEED_FLOOR,
  ALPHAOMEGA_BLOCK_SPEED_MID_BAND,
  formatAmdDayGateAdvisoryDetail,
  formatFoundingSummary,
  isAlphaOmegaSpeedBandAdvisory,
  isAlphaOmegaSpeedFloorAdvisory,
  parseAlphaOmegaFoundingMeta,
} from './alphaOmegaAdvisoryParse';

export type Phase2AdvisoryKind =
  | 'crack_entry'
  | 'shadow_paper_entry'
  | 'speedfloor_shadow'
  | 'speed_mid_band'
  | 'entry_blackout'
  | 'no_crack'
  | 'already_open'
  | 'invalid_direction'
  | 'disabled_fallback'
  | 'amd_day_gate'
  | 'clear'
  | 'r1_shadow'
  | 'phase2_shadow'
  | 'r1_live'
  | 'phase2_live';

export interface Phase2AdvisoryDisplay {
  kind: Phase2AdvisoryKind;
  label: string;
  detail: string | null;
}

function foundingDetail(laneAdvisory: string | null): string | null {
  return formatFoundingSummary(parseAlphaOmegaFoundingMeta(laneAdvisory));
}

function resolveBlockedAlphaOmega(
  laneAdvisory: string | null,
  blockReason: string | null | undefined,
): Phase2AdvisoryDisplay | null {
  const advisoryText = (laneAdvisory ?? '').trim();
  // SPEEDFLOOR paper path — must stay distinct from mid-band / blackout.
  if (blockReason === ALPHAOMEGA_BLOCK_SPEED_FLOOR || isAlphaOmegaSpeedFloorAdvisory(advisoryText)) {
    return {
      kind: 'speedfloor_shadow',
      label: 'SPEED FLOOR',
      detail: foundingDetail(advisoryText) ?? 'Would enter — founding ≤35m',
    };
  }
  if (
    blockReason === ALPHAOMEGA_BLOCK_SPEED_MID_BAND ||
    isAlphaOmegaSpeedBandAdvisory(advisoryText)
  ) {
    return {
      kind: 'speed_mid_band',
      label: 'SPEED MID',
      detail: foundingDetail(advisoryText) ?? 'Would enter — speed 45–60m',
    };
  }
  if (blockReason === ALPHAOMEGA_BLOCK_ENTRY_BLACKOUT) {
    return {
      kind: 'entry_blackout',
      label: 'BLACKOUT',
      detail: 'No new entries 21:00–21:15 UTC',
    };
  }
  if (blockReason === ALPHAOMEGA_BLOCK_NO_CRACK) {
    return { kind: 'no_crack', label: 'NO CRACK', detail: null };
  }
  if (blockReason === ALPHAOMEGA_BLOCK_ALREADY_OPEN) {
    return { kind: 'already_open', label: 'ALREADY OPEN', detail: foundingDetail(advisoryText) };
  }
  if (blockReason === ALPHAOMEGA_BLOCK_INVALID_DIRECTION) {
    return { kind: 'invalid_direction', label: 'BAD DIR', detail: null };
  }
  if (blockReason === ALPHAOMEGA_BLOCK_AMD_DAY_GATE) {
    return {
      kind: 'amd_day_gate',
      label: 'AMD DAY GATE',
      detail:
        formatAmdDayGateAdvisoryDetail(advisoryText) ??
        'AMD_FAILED — Combined Stack blocked live entry',
    };
  }
  return null;
}

function resolveAdvisoryAlphaOmega(laneAdvisory: string | null): Phase2AdvisoryDisplay | null {
  const advisoryText = (laneAdvisory ?? '').trim();
  if (advisoryText.startsWith(ALPHAOMEGA_ADVISORY_ENTRY_PREFIX)) {
    return { kind: 'crack_entry', label: 'CRACK ENTRY', detail: foundingDetail(advisoryText) };
  }
  if (advisoryText.startsWith(ALPHAOMEGA_ADVISORY_SHADOW_ENTRY_PREFIX)) {
    return {
      kind: 'shadow_paper_entry',
      label: 'PAPER ENTRY',
      detail: foundingDetail(advisoryText) ?? 'Shadow AO paper — not live risk',
    };
  }
  if (advisoryText.startsWith(ALPHAOMEGA_ADVISORY_SPEEDFLOOR_PREFIX)) {
    return {
      kind: 'speedfloor_shadow',
      label: 'SPEED FLOOR',
      detail: foundingDetail(advisoryText) ?? 'Would enter — founding ≤35m',
    };
  }
  if (advisoryText.startsWith(ALPHAOMEGA_ADVISORY_SPEEDBAND_PREFIX)) {
    return {
      kind: 'speed_mid_band',
      label: 'SPEED MID',
      detail: foundingDetail(advisoryText) ?? 'Would enter — speed 45–60m',
    };
  }
  if (advisoryText === ALPHAOMEGA_ADVISORY_DISABLED) {
    return {
      kind: 'disabled_fallback',
      label: 'DISABLED',
      detail: 'Kill switch off — unfiltered entry',
    };
  }
  return null;
}

function extractPhase2FlagDetail(raw: string | null): string | null {
  if (!raw) return null;
  const marker = 'PHASE2_TWO_PLUS:';
  const markerIndex = raw.indexOf(marker);
  if (markerIndex === -1) return raw;
  const flagText = raw.slice(markerIndex + marker.length).trim();
  return flagText || null;
}

function resolveLegacyDisplay(
  laneAdvisory: string | null | undefined,
  decision: string,
  blockReason: string | null | undefined,
): Phase2AdvisoryDisplay {
  if (decision === 'BLOCKED') {
    if (blockReason === LANE_B_BLOCK_R1_FLIP) {
      return { kind: 'r1_live', label: 'R1 LIVE', detail: 'Flip cooldown enforced' };
    }
    if (blockReason === LANE_B_BLOCK_PHASE2_DIST) {
      return {
        kind: 'phase2_live',
        label: 'Phase2 LIVE',
        detail: extractPhase2FlagDetail(laneAdvisory ?? null),
      };
    }
  }

  const advisoryText = (laneAdvisory ?? '').trim();
  if (advisoryText.startsWith(`${LANE_B_BLOCK_R1_FLIP}:shadow`)) {
    return { kind: 'r1_shadow', label: 'R1 shadow', detail: 'Would block — still filled (W0)' };
  }
  if (advisoryText.includes(`${LANE_B_BLOCK_PHASE2_DIST}:shadow`)) {
    return {
      kind: 'phase2_shadow',
      label: 'Phase2 shadow',
      detail: extractPhase2FlagDetail(advisoryText),
    };
  }
  return { kind: 'clear', label: 'Clear', detail: null };
}

export function resolvePhase2AdvisoryDisplay(
  laneAdvisory: string | null | undefined,
  decision: string,
  blockReason: string | null | undefined,
): Phase2AdvisoryDisplay {
  if (decision === 'BLOCKED') {
    const blocked = resolveBlockedAlphaOmega(laneAdvisory ?? null, blockReason);
    if (blocked) return blocked;
  }
  const fromAdvisory = resolveAdvisoryAlphaOmega(laneAdvisory ?? null);
  if (fromAdvisory) return fromAdvisory;
  return resolveLegacyDisplay(laneAdvisory, decision, blockReason);
}

/** Violet paper / Speed-floor shadow filter — floor-only (not mid-band, not blackout). */
export function isPhase2ShadowFlagged(row: {
  lane_advisory?: string | null;
  decision: string;
  block_reason?: string | null;
}): boolean {
  const display = resolvePhase2AdvisoryDisplay(
    row.lane_advisory,
    row.decision,
    row.block_reason,
  );
  return (
    display.kind === 'speedfloor_shadow' ||
    display.kind === 'r1_shadow' ||
    display.kind === 'phase2_shadow'
  );
}

/** Blocked filter — hard AO gate rejects (excludes SPEEDFLOOR paper shadows). */
export function isAlphaOmegaLiveBlock(row: {
  lane_advisory?: string | null;
  decision: string;
  block_reason?: string | null;
}): boolean {
  if (row.decision !== 'BLOCKED' || isPhase2ShadowFlagged(row)) return false;
  const display = resolvePhase2AdvisoryDisplay(
    row.lane_advisory,
    row.decision,
    row.block_reason,
  );
  return (
    display.kind === 'no_crack' ||
    display.kind === 'already_open' ||
    display.kind === 'invalid_direction' ||
    display.kind === 'speed_mid_band' ||
    display.kind === 'entry_blackout' ||
    display.kind === 'amd_day_gate' ||
    display.kind === 'r1_live' ||
    display.kind === 'phase2_live'
  );
}
