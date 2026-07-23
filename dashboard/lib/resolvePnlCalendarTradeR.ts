import { ALPHAOMEGA_HARD_STOP_PIPS, isOmegaLaneBBroker } from './omegaLaneBConstants';
import type { PnlTradeRow } from './pnlCalendarTypes';

function isLaneBAlphaOmegaTrade(trade: PnlTradeRow): boolean {
  return trade.engine_id === 'omega' && isOmegaLaneBBroker(trade.broker_id);
}

function hardStopRFromPips(pnlPips: number): number {
  return Math.round((pnlPips / ALPHAOMEGA_HARD_STOP_PIPS) * 100) / 100;
}

/**
 * Effective R for calendar rollups/display.
 *
 * Lane B ALPHAOMEGA: always use pips / hard-stop (1R = 10p) when pips exist.
 * Stored pnl_r for AO is often signal-SL dollar-risk R (tiny crack SLs → huge R),
 * while older null rows already fell back to hard-stop — mixing those two
 * definitions makes Total R wrong. Other engines keep stored pnl_r unchanged.
 */
export function resolvePnlCalendarTradeR(trade: PnlTradeRow): number {
  if (
    isLaneBAlphaOmegaTrade(trade) &&
    trade.pnl_pips != null &&
    Number.isFinite(trade.pnl_pips) &&
    ALPHAOMEGA_HARD_STOP_PIPS > 0
  ) {
    return hardStopRFromPips(trade.pnl_pips);
  }
  if (trade.pnl_r != null && Number.isFinite(trade.pnl_r)) {
    return trade.pnl_r;
  }
  return 0;
}

/** Whether the trade has a displayable R (AO hard-stop from pips, or stored). */
export function hasPnlCalendarTradeR(trade: PnlTradeRow): boolean {
  if (
    isLaneBAlphaOmegaTrade(trade) &&
    trade.pnl_pips != null &&
    Number.isFinite(trade.pnl_pips)
  ) {
    return true;
  }
  return trade.pnl_r != null && Number.isFinite(trade.pnl_r);
}
