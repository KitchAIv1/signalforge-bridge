import {
  LANE_B_BLOCK_PHASE2_DIST,
  LANE_B_BLOCK_R1_FLIP,
} from '@/lib/omegaLaneBConstants';

export type Phase2AdvisoryKind =
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

function extractPhase2FlagDetail(raw: string | null): string | null {
  if (!raw) return null;
  const marker = 'PHASE2_TWO_PLUS:';
  const markerIndex = raw.indexOf(marker);
  if (markerIndex === -1) return raw;
  const flagText = raw.slice(markerIndex + marker.length).trim();
  return flagText || null;
}

export function resolvePhase2AdvisoryDisplay(
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
  return display.kind === 'r1_shadow' || display.kind === 'phase2_shadow';
}
