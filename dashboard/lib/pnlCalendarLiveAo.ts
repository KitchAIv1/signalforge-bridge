/**
 * Calendar AO identity — live EXECUTED fills only.
 * Excludes SPEEDFLOOR paper, toxic-crack blocks, and ao_shadow_paper.
 */

import {
  isOmegaAoShadowBroker,
  isOmegaLaneBBroker,
} from '@/lib/omegaLaneBConstants';
import type { PnlTradeRow } from '@/lib/pnlCalendarTypes';

function hasBrokerFillId(trade: PnlTradeRow): boolean {
  return trade.oanda_trade_id != null && trade.oanda_trade_id !== '';
}

/** SPEEDFLOOR paper closes tagged in close_reason (belt-and-suspenders). */
export function isSpeedfloorPaperCalendarClose(trade: PnlTradeRow): boolean {
  const reason = trade.close_reason ?? '';
  return reason.startsWith('speedfloor_paper_');
}

/**
 * Live ALPHAOMEGA calendar trade: omega + live AO broker + real fill.
 * Never shadow paper broker; never BLOCKED paper rows.
 */
export function isLiveAlphaOmegaCalendarTrade(trade: PnlTradeRow): boolean {
  if (trade.engine_id !== 'omega') return false;
  if (!isOmegaLaneBBroker(trade.broker_id)) return false;
  if (isSpeedfloorPaperCalendarClose(trade)) return false;
  if (trade.decision === 'EXECUTED') return true;
  // Legacy rows without decision: require a broker fill id.
  if (trade.decision == null || trade.decision === '') {
    return hasBrokerFillId(trade);
  }
  return false;
}

/** Shadow AO paper — must not appear under AO or Omega calendar filters. */
export function isShadowAoCalendarTrade(trade: PnlTradeRow): boolean {
  return trade.engine_id === 'omega' && isOmegaAoShadowBroker(trade.broker_id);
}
