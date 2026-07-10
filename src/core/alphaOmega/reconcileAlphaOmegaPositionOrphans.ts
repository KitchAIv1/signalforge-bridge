/**
 * Defense-in-depth: if position_state points at a trade that is no longer
 * open in bridge_trade_log (max_hold / external / manual), drop the orphan
 * before opposing-fire tracking can update or attempt a ghost close.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logWarn } from '../../utils/logger.js';
import { clearAlphaOmegaPositionState } from './clearAlphaOmegaPositionState.js';

export async function filterOpenAlphaOmegaPositions<T extends { oanda_trade_id: string }>(
  supabase: SupabaseClient,
  positions: T[],
): Promise<T[]> {
  if (positions.length === 0) return positions;
  const stillOpen: T[] = [];
  for (const position of positions) {
    if (await isLaneBTradeStillOpen(supabase, position.oanda_trade_id)) {
      stillOpen.push(position);
      continue;
    }
    logWarn('[AlphaOmega] Dropping orphaned position_state (trade not open)', {
      oandaTradeId: position.oanda_trade_id,
    });
    await clearAlphaOmegaPositionState(supabase, position.oanda_trade_id);
  }
  return stillOpen;
}

async function isLaneBTradeStillOpen(
  supabase: SupabaseClient,
  oandaTradeId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_trade_log')
    .select('id')
    .eq('oanda_trade_id', oandaTradeId)
    .eq('status', 'open')
    .limit(1);
  if (error) {
    logWarn('[AlphaOmega] open-trade check failed — keeping position_state', {
      oandaTradeId,
      error: error.message,
    });
    return true;
  }
  return (data?.length ?? 0) > 0;
}
