/**
 * One-at-a-time sequencing for omega Trail v1 — block when any omega trade is open.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface OmegaOpenTradeBlock {
  blocked: boolean;
  reason: string | null;
  oandaTradeId: string | null;
}

export async function checkOmegaOpenTradeBlock(
  supabase: SupabaseClient,
): Promise<OmegaOpenTradeBlock> {
  const { data: openRows } = await supabase
    .from('bridge_trade_log')
    .select('id, oanda_trade_id, direction, leg_type')
    .eq('engine_id', 'omega')
    .eq('status', 'open')
    .not('oanda_trade_id', 'is', null)
    .limit(1);

  if (openRows == null || openRows.length === 0) {
    return { blocked: false, reason: null, oandaTradeId: null };
  }

  const blocker = openRows[0]!;
  const legLabel = blocker.leg_type != null ? String(blocker.leg_type) : 'primary';
  return {
    blocked: true,
    reason:
      `OMEGA_TRADE_OPEN: ${blocker.direction} trade ${blocker.oanda_trade_id} ` +
      `${legLabel} still open — one trade at a time`,
    oandaTradeId: String(blocker.oanda_trade_id),
  };
}
