import { ALPHAOMEGA_HARD_STOP_PIPS, OMEGA_LANE_B_BROKER_ID } from '@/lib/omegaLaneBConstants';
import type { PnlTradeRow } from '@/lib/pnlCalendarTypes';

function isLaneBAlphaOmegaTrade(trade: PnlTradeRow): boolean {
  return trade.engine_id === 'omega' && trade.broker_id === OMEGA_LANE_B_BROKER_ID;
}

/**
 * Effective R for calendar rollups/display.
 * Lane B AO closes historically omitted pnl_r — fall back to pips / hard-stop.
 */
export function resolvePnlCalendarTradeR(trade: PnlTradeRow): number {
  if (trade.pnl_r != null && Number.isFinite(trade.pnl_r)) {
    return trade.pnl_r;
  }
  if (
    isLaneBAlphaOmegaTrade(trade) &&
    trade.pnl_pips != null &&
    Number.isFinite(trade.pnl_pips) &&
    ALPHAOMEGA_HARD_STOP_PIPS > 0
  ) {
    return Math.round((trade.pnl_pips / ALPHAOMEGA_HARD_STOP_PIPS) * 100) / 100;
  }
  return 0;
}

/** Whether the trade has a displayable R (stored or AO pips fallback). */
export function hasPnlCalendarTradeR(trade: PnlTradeRow): boolean {
  if (trade.pnl_r != null && Number.isFinite(trade.pnl_r)) return true;
  return (
    isLaneBAlphaOmegaTrade(trade) &&
    trade.pnl_pips != null &&
    Number.isFinite(trade.pnl_pips)
  );
}
