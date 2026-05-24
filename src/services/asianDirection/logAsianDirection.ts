import type { SupabaseClient } from '@supabase/supabase-js';
import type { AsianDirectionLogRow } from './types.js';

export async function logAsianDirectionRow(
  supabase: SupabaseClient,
  row: AsianDirectionLogRow,
): Promise<void> {
  const { error } = await supabase.from('asian_direction_log').insert(row);
  if (error) {
    console.error('[AsianDirection] Failed to write log row:', error.message);
  }
}
