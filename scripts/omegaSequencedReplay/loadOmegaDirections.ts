/** Load omega_direction by trade date for hybrid (non-raw) replay. */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function loadOmegaDirectionByDate(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const directionMap = new Map<string, string>();

  const { data, error } = await supabase
    .from('asian_direction_log')
    .select('trade_date, direction_set')
    .order('trade_date', { ascending: true });

  if (error) throw new Error(`loadOmegaDirectionByDate: ${error.message}`);

  for (const row of data ?? []) {
    const tradeDate = String((row as { trade_date: string }).trade_date);
    const direction = String((row as { direction_set: string | null }).direction_set ?? '').toLowerCase();
    if (direction === 'long' || direction === 'short') {
      directionMap.set(tradeDate, direction);
    }
  }

  return directionMap;
}
