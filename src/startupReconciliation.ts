/**
 * On startup: reconcile OANDA open trades vs bridge_trade_log; pre-populate dedup from last 60s.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getOpenTrades } from './connectors/oanda.js';
import { prePopulateDedupFromLog } from './core/conflictResolver.js';

export async function runStartupReconciliation(supabase: SupabaseClient): Promise<void> {
  const oandaTrades = await getOpenTrades();
  const { data: logOpen } = await supabase.from('bridge_trade_log').select('oanda_trade_id, id').eq('status', 'open');
  const logIds = new Set((logOpen ?? []).map((r: { oanda_trade_id: string }) => r.oanda_trade_id));

  for (const ot of oandaTrades) {
    if (!logIds.has(ot.id)) {
      await supabase.from('bridge_trade_log').insert({
        signal_id: ot.id,
        engine_id: 'reconciled',
        pair: ot.instrument,
        direction: ot.units.startsWith('-') ? 'SHORT' : 'LONG',
        stop_loss: 0,
        signal_received_at: ot.openTime ?? new Date().toISOString(),
        decision: 'EXECUTED',
        status: 'open',
        oanda_trade_id: ot.id,
        units: parseInt(ot.units, 10),
        notes: 'reconciled on startup',
      });
    }
  }

  const { data: recent } = await supabase
    .from('bridge_trade_log')
    .select('pair, direction, signal_received_at')
    .eq('decision', 'EXECUTED')
    .gte('signal_received_at', new Date(Date.now() - 60000).toISOString());
  prePopulateDedupFromLog((recent ?? []) as Array<{ pair: string; direction: string; signal_received_at: string }>);
}
