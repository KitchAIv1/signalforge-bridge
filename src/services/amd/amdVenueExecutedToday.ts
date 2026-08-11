/**
 * Per-venue AMD once-per-day EXECUTED guard (AO open-check analogue for AMD).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const ENGINE_ID = 'engine_amd';

/** True when engine_amd already has an EXECUTED row today on this broker. */
export async function hasAmdVenueExecutedToday(
  supabase: SupabaseClient,
  brokerId: string,
  todayStr: string,
): Promise<boolean> {
  const { count } = await supabase
    .from('bridge_trade_log')
    .select('id', { count: 'exact', head: true })
    .eq('engine_id', ENGINE_ID)
    .eq('broker_id', brokerId)
    .eq('decision', 'EXECUTED')
    .gte('created_at', `${todayStr}T00:00:00Z`);
  return (count ?? 0) > 0;
}
