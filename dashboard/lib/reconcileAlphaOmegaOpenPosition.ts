/**
 * Pure helpers: treat position_state as open only when bridge_trade_log
 * still says open. Surfaces last Lane B exit so Flat can show max_hold etc.
 */

import type { AlphaOmegaOpenPositionSnapshot } from '@/lib/alphaOmegaLiveStateMap';

export interface AlphaOmegaLastExitSnapshot {
  oandaTradeId: string;
  direction: string;
  closeReason: string | null;
  closedAt: string;
  pnlPips: number | null;
}

export function reconcileOpenPositionAgainstTradeLog(
  position: AlphaOmegaOpenPositionSnapshot | null,
  tradeLogStatus: string | null,
): AlphaOmegaOpenPositionSnapshot | null {
  if (!position) return null;
  if (tradeLogStatus != null && tradeLogStatus !== 'open') return null;
  return position;
}

export function mapAlphaOmegaLastExitRow(
  row: Record<string, unknown> | null,
): AlphaOmegaLastExitSnapshot | null {
  if (!row?.oanda_trade_id || !row.closed_at) return null;
  return {
    oandaTradeId: String(row.oanda_trade_id),
    direction: String(row.direction ?? ''),
    closeReason: (row.close_reason as string | null) ?? null,
    closedAt: String(row.closed_at),
    pnlPips: row.pnl_pips != null ? Number(row.pnl_pips) : null,
  };
}
