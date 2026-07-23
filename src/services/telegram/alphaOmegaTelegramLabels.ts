/**
 * Telegram display helpers for ALPHAOMEGA Lane B — keep alert modules thin.
 */

import {
  ALPHAOMEGA_CLOSE_BACKSTOP_CRACK,
  ALPHAOMEGA_CLOSE_HARD_STOP,
  ALPHAOMEGA_CLOSE_OPPOSING_COUNT,
  ALPHAOMEGA_CLOSE_OPPOSING_SHARE,
  OMEGA_AO_VT_BROKER_ID,
  OMEGA_LANE_B_BROKER_ID,
  isOmegaLaneBBroker,
} from '../../core/alphaOmega/alphaOmegaConstants.js';

const CLOSE_REASON_LABELS: Record<string, string> = {
  [ALPHAOMEGA_CLOSE_OPPOSING_COUNT]: 'Opposing ×5',
  [ALPHAOMEGA_CLOSE_OPPOSING_SHARE]: 'Opposing 100%',
  [ALPHAOMEGA_CLOSE_HARD_STOP]: 'Hard stop 10p',
  [ALPHAOMEGA_CLOSE_BACKSTOP_CRACK]: 'Backstop crack',
};

export const ALPHAOMEGA_LANE_LABEL = 'ALPHAOMEGA';

export function alphaOmegaLaneLabelForBroker(brokerId: string | null | undefined): string | null {
  if (!isOmegaLaneBBroker(brokerId)) return null;
  if (brokerId === OMEGA_AO_VT_BROKER_ID) return 'ALPHAOMEGA · VT';
  if (brokerId === OMEGA_LANE_B_BROKER_ID) return 'ALPHAOMEGA · OANDA';
  return ALPHAOMEGA_LANE_LABEL;
}

export function formatAlphaOmegaCloseReasonForTelegram(closeReason: string): string {
  return CLOSE_REASON_LABELS[closeReason] ?? closeReason;
}

export function formatAlphaOmegaFoundingHint(laneAdvisory: string | null | undefined): string | null {
  const text = (laneAdvisory ?? '').trim();
  if (!text.startsWith('ALPHAOMEGA_ENTRY:')) return null;
  const lengthMatch = text.match(/len=(\d+)/);
  const speedMatch = text.match(/speed=([\d.]+)m/);
  if (!lengthMatch && !speedMatch) return text;
  const lengthPart = lengthMatch ? lengthMatch[1] : '?';
  const speedPart = speedMatch ? `${speedMatch[1]}m` : '?';
  return `Crack entry ${lengthPart} @ ${speedPart}`;
}
