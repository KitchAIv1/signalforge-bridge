import {
  LANE_B_BLOCK_PHASE2_DIST,
  LANE_B_BLOCK_R1_FLIP,
} from '@/lib/omegaLaneBConstants';
import {
  ALPHAOMEGA_ADVISORY_DISABLED,
  ALPHAOMEGA_ADVISORY_ENTRY_PREFIX,
  ALPHAOMEGA_ADVISORY_SPEEDFLOOR_PREFIX,
  ALPHAOMEGA_BLOCK_ALREADY_OPEN,
  ALPHAOMEGA_BLOCK_INVALID_DIRECTION,
  ALPHAOMEGA_BLOCK_NO_CRACK,
  ALPHAOMEGA_BLOCK_SPEED_FLOOR,
  formatFoundingSummary,
  isAlphaOmegaSpeedFloorAdvisory,
  parseAlphaOmegaFoundingMeta,
} from '@/lib/alphaOmegaAdvisoryParse';

export type Phase2AdvisoryKind =
  | 'crack_entry'
  | 'speedfloor_shadow'
  | 'no_crack'
  | 'already_open'
  | 'invalid_direction'
  | 'disabled_fallback'
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
  if (blockReason === ALPHAOMEGA_BLOCK_SPEED_FLOOR || isAlphaOmegaSpeedFloorAdvisory(advisoryText)) {
    return {
      kind: 'speedfloor_shadow',
      label: 'SPEED FLOOR',
      detail: foundingDetail(advisoryText) ?? 'Would enter — too fast',
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
  return null;
}

function resolveAdvisoryAlphaOmega(laneAdvisory: string | null): Phase2AdvisoryDisplay | null {
  const advisoryText = (laneAdvisory ?? '').trim();
  if (advisoryText.startsWith(ALPHAOMEGA_ADVISORY_ENTRY_PREFIX)) {
    return { kind: 'crack_entry', label: 'CRACK ENTRY', detail: foundingDetail(advisoryText) };
  }
  if (advisoryText.startsWith(ALPHAOMEGA_ADVISORY_SPEEDFLOOR_PREFIX)) {
    return {
      kind: 'speedfloor_shadow',
      label: 'SPEED FLOOR',
      detail: foundingDetail(advisoryText) ?? 'Would enter — too fast',
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
    display.kind === 'r1_live' ||
    display.kind === 'phase2_live'
  );
}
