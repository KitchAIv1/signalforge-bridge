/**
 * Display-only venue labels for AO trade rows (live books vs shadow paper).
 */

import {
  OMEGA_AO_SHADOW_BROKER_ID,
  OMEGA_AO_VT_BROKER_ID,
  OMEGA_LANE_B_BROKER_ID,
} from '@/lib/omegaLaneBConstants';

export type AoTradeVenueKind = 'paper' | 'oanda' | 'vt' | 'unknown';

export function resolveAoTradeVenueKind(
  brokerId: string | null | undefined,
): AoTradeVenueKind {
  if (brokerId === OMEGA_AO_SHADOW_BROKER_ID) return 'paper';
  if (brokerId === OMEGA_LANE_B_BROKER_ID) return 'oanda';
  if (brokerId === OMEGA_AO_VT_BROKER_ID) return 'vt';
  return 'unknown';
}

/** Short chip label — PAPER / OANDA / VT, or null when unknown. */
export function aoTradeVenueChipLabel(
  brokerId: string | null | undefined,
): string | null {
  const kind = resolveAoTradeVenueKind(brokerId);
  if (kind === 'paper') return 'PAPER';
  if (kind === 'oanda') return 'OANDA';
  if (kind === 'vt') return 'VT';
  return null;
}

/** Decision chip: shadow paper EXECUTED → PAPER; live EXECUTED → TAKEN. */
export function aoTradeDecisionChipLabel(
  decision: string,
  brokerId: string | null | undefined,
): string {
  if (decision === 'EXECUTED') {
    return resolveAoTradeVenueKind(brokerId) === 'paper' ? 'PAPER' : 'TAKEN';
  }
  return decision;
}
