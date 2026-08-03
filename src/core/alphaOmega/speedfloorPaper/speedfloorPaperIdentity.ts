/**
 * SPEEDFLOOR paper row identity — BLOCKED floor shadows on live AO brokers.
 * Never matches ao_shadow_paper or EXECUTED fills.
 */

import {
  ALPHAOMEGA_BLOCK_SPEED_FLOOR,
  OMEGA_AO_BROKER_IDS,
} from '../alphaOmegaConstants.js';

/** Advisory prefix written by entry gate. */
export const SPEEDFLOOR_SHADOW_ADVISORY_PREFIX = 'ALPHAOMEGA_SPEEDFLOOR_SHADOW:';

export function isSpeedfloorPaperBlockReason(blockReason: string | null | undefined): boolean {
  return blockReason === ALPHAOMEGA_BLOCK_SPEED_FLOOR;
}

export function isSpeedfloorPaperAdvisory(laneAdvisory: string | null | undefined): boolean {
  return (laneAdvisory ?? '').trim().startsWith(SPEEDFLOOR_SHADOW_ADVISORY_PREFIX);
}

export function isSpeedfloorPaperRow(row: {
  decision?: string | null;
  block_reason?: string | null;
  lane_advisory?: string | null;
  broker_id?: string | null;
}): boolean {
  if (row.decision !== 'BLOCKED') return false;
  if (!row.broker_id || !(OMEGA_AO_BROKER_IDS as readonly string[]).includes(row.broker_id)) {
    return false;
  }
  return (
    isSpeedfloorPaperBlockReason(row.block_reason) ||
    isSpeedfloorPaperAdvisory(row.lane_advisory)
  );
}

export function isOpenSpeedfloorPaperRow(row: {
  decision?: string | null;
  block_reason?: string | null;
  lane_advisory?: string | null;
  broker_id?: string | null;
  status?: string | null;
  pnl_pips?: number | null;
}): boolean {
  if (!isSpeedfloorPaperRow(row)) return false;
  if (row.status === 'closed') return false;
  return row.pnl_pips == null;
}
