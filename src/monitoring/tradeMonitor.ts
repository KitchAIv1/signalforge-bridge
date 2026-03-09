/**
 * Every 30s: sync open trades with OANDA; close if past max_hold_hours; update bridge_trade_log.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getOpenTrades, closeTrade } from '../connectors/oanda.js';
import { recordClosedTrade } from '../core/circuitBreaker.js';
import type { BridgeEngineRow } from '../types/config.js';

export async function runTradeMonitor(
  supabase: SupabaseClient,
  engines: BridgeEngineRow[],
  maxHoldHours: number = 4
): Promise<void> {
  const oandaTrades = await getOpenTrades();
  const oandaIds = new Set(oandaTrades.map((t) => t.id));

  const { data: logOpen } = await supabase
    .from('bridge_trade_log')
    .select('id, oanda_trade_id, engine_id, signal_received_at')
    .eq('status', 'open')
    .not('oanda_trade_id', 'is', null);

  const engineById = new Map(engines.map((e) => [e.engine_id, e]));

  for (const row of logOpen ?? []) {
    const tid = row.oanda_trade_id as string;
    const openTime = row.signal_received_at as string;
    const engine = engineById.get(row.engine_id as string);
    const maxHold = (engine?.max_hold_hours ?? maxHoldHours) * 60 * 60 * 1000;
    const elapsed = Date.now() - new Date(openTime).getTime();

    if (!oandaIds.has(tid)) {
      await supabase.from('bridge_trade_log').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', row.id);
      recordClosedTrade('win');
      continue;
    }
    if (elapsed >= maxHold) {
      await closeTrade(tid);
      await supabase.from('bridge_trade_log').update({ status: 'closed', close_reason: 'max_hold', closed_at: new Date().toISOString() }).eq('id', row.id);
      recordClosedTrade('breakeven');
    }
  }
}
