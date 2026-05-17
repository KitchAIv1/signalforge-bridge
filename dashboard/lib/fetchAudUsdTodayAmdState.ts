import { getSupabase } from '@/lib/supabase';
import type { AmdState } from '@/lib/types';

export async function fetchAudUsdTodayAmdState(): Promise<AmdState | null> {
  const supabase = getSupabase();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error: queryError } = await supabase
    .from('amd_state')
    .select('*')
    .eq('pair', 'AUD_USD')
    .eq('trade_date', today)
    .maybeSingle();

  if (queryError) throw new Error(queryError.message);
  return (data as AmdState | null) ?? null;
}
