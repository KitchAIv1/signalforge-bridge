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

/**
 * Per-broker one-at-a-time sequencing for omega.
 *
 * With multi-broker fan-out each active broker (e.g. oanda_practice +
 * vtmarkets_omega_demo) sequences independently: a broker holding an open omega
 * trade only skips that broker, not the whole signal. The signal is only fully
 * BLOCKED when EVERY active omega broker is occupied.
 *
 * Falls back to the legacy global block ({@link checkOmegaOpenTradeBlock}) when
 * there is 0 or 1 active broker link, so single-broker behaviour is unchanged.
 */
export async function checkOmegaBrokerSequencingBlock(
  supabase: SupabaseClient,
): Promise<OmegaOpenTradeBlock> {
  const { data: links } = await supabase
    .from('bridge_links')
    .select('broker_id')
    .eq('engine_id', 'omega')
    .eq('is_active', true);

  const brokerIds = (links ?? [])
    .map((link) => String((link as { broker_id: unknown }).broker_id))
    .filter((brokerId) => brokerId.length > 0);

  if (brokerIds.length <= 1) {
    return checkOmegaOpenTradeBlock(supabase);
  }

  const { data: openRows } = await supabase
    .from('bridge_trade_log')
    .select('oanda_trade_id, direction, leg_type, broker_id')
    .eq('engine_id', 'omega')
    .eq('status', 'open')
    .not('oanda_trade_id', 'is', null);

  const busyBrokers = new Set(
    (openRows ?? []).map((row) =>
      String((row as { broker_id: unknown }).broker_id ?? 'oanda_practice'),
    ),
  );

  const freeBroker = brokerIds.find((brokerId) => !busyBrokers.has(brokerId));
  if (freeBroker != null) {
    return { blocked: false, reason: null, oandaTradeId: null };
  }

  const blocker = (openRows ?? [])[0] as
    | { oanda_trade_id: unknown; direction: unknown; leg_type: unknown }
    | undefined;
  const legLabel = blocker?.leg_type != null ? String(blocker.leg_type) : 'primary';
  return {
    blocked: true,
    reason:
      `OMEGA_TRADE_OPEN (all ${brokerIds.length} brokers occupied): ` +
      `${blocker?.direction} trade ${blocker?.oanda_trade_id} ${legLabel} — one trade at a time per broker`,
    oandaTradeId: blocker?.oanda_trade_id != null ? String(blocker.oanda_trade_id) : null,
  };
}
