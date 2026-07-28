/**
 * Close Shadow AO paper trade — trade-log update only, no broker API.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logInfo, logWarn } from '../../utils/logger.js';
import { OMEGA_AO_SHADOW_BROKER_ID } from './alphaOmegaConstants.js';
import {
  deleteShadowPosition,
  type ShadowPositionRow,
} from './alphaOmegaShadowPositionTracking.js';

const PIP = 0.0001;

function computePaperPnlPips(
  position: ShadowPositionRow,
  exitPrice: number | null,
): number | null {
  if (position.entry_price == null || exitPrice == null) return null;
  const raw =
    position.direction === 'LONG'
      ? (exitPrice - position.entry_price) / PIP
      : (position.entry_price - exitPrice) / PIP;
  return Math.round(raw * 10) / 10;
}

export async function closeShadowPaperTrade(
  supabase: SupabaseClient,
  position: ShadowPositionRow,
  closeReason: string,
  exitPrice: number | null = position.entry_price,
): Promise<void> {
  const pnlPips = computePaperPnlPips(position, exitPrice);
  const closedAt = new Date().toISOString();
  const { error } = await supabase
    .from('bridge_trade_log')
    .update({
      status: 'closed',
      closed_at: closedAt,
      close_reason: closeReason,
      exit_price: exitPrice,
      pnl_pips: pnlPips,
      updated_at: closedAt,
    })
    .eq('broker_id', OMEGA_AO_SHADOW_BROKER_ID)
    .eq('oanda_trade_id', position.paper_trade_id)
    .eq('status', 'open');

  if (error) {
    logWarn('[AlphaOmegaShadow] paper close trade_log update failed', {
      error: error.message,
      paperTradeId: position.paper_trade_id,
    });
  } else {
    logInfo('[AlphaOmegaShadow] paper trade closed', {
      paperTradeId: position.paper_trade_id,
      closeReason,
      pnlPips,
    });
  }
  await deleteShadowPosition(supabase, position.paper_trade_id);
}
