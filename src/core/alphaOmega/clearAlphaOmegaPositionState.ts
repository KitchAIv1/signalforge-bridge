/**
 * Clears Lane B ALPHAOMEGA position_state when a trade closes outside the
 * AlphaOmega close path (max_hold, external/broker sync, manual override sync).
 * Prevents orphaned rows that keep Open Risk "open" and keep counting fires.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logInfo, logWarn } from '../../utils/logger.js';
import { isOmegaLaneBBroker } from './alphaOmegaConstants.js';

export async function clearAlphaOmegaPositionState(
  supabase: SupabaseClient,
  oandaTradeId: string,
): Promise<void> {
  const { error, count } = await supabase
    .from('alpha_omega_position_state')
    .delete({ count: 'exact' })
    .eq('oanda_trade_id', oandaTradeId);
  if (error) {
    logWarn('[AlphaOmega] clearAlphaOmegaPositionState failed', {
      oandaTradeId,
      error: error.message,
    });
    return;
  }
  if ((count ?? 0) > 0) {
    logInfo('[AlphaOmega] Cleared position_state after non-AO close', {
      oandaTradeId,
      deleted: count,
    });
  }
}

/** No-op unless this close landed on Lane B and the log row finalize succeeded. */
export async function clearLaneBPositionStateAfterExternalClose(
  supabase: SupabaseClient,
  brokerId: string | null | undefined,
  oandaTradeId: string,
  finalizeSucceeded: boolean,
): Promise<void> {
  if (!finalizeSucceeded || !isOmegaLaneBBroker(brokerId)) return;
  await clearAlphaOmegaPositionState(supabase, oandaTradeId);
}
