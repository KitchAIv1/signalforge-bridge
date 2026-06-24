/** Backfill live_pnl_pips on shadow rows snapshotted while legs were still open. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadLiveLegPnl } from './loadPendingSignals.js';

const REFRESH_LOOKBACK_DAYS = 14;
const REFRESH_ROW_LIMIT = 200;

export async function refreshStaleLivePnl(supabase: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - REFRESH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { data: staleRows, error } = await supabase
    .from('omega_shadow_trail_exit')
    .select('signal_id')
    .is('live_pnl_pips', null)
    .gte('trade_date', since)
    .limit(REFRESH_ROW_LIMIT);
  if (error) throw new Error(`[ShadowTrail] live refresh fetch: ${error.message}`);
  if (!staleRows?.length) return 0;

  let updated = 0;
  for (const row of staleRows) {
    const signalId = String(row.signal_id);
    const liveLeg = await loadLiveLegPnl(supabase, signalId);
    if (liveLeg.pnlPips == null) continue;
    const { error: updateErr } = await supabase
      .from('omega_shadow_trail_exit')
      .update({
        live_pnl_pips: liveLeg.pnlPips,
        live_result: liveLeg.result,
      })
      .eq('signal_id', signalId)
      .is('live_pnl_pips', null);
    if (!updateErr) updated += 1;
  }
  return updated;
}
