import { getSupabase } from '@/lib/supabase';
import type { AmdState } from '@/lib/types';

export async function fetchAmdHistory(limitDays: number = 300): Promise<AmdState[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('amd_state')
    .select('*')
    .eq('pair', 'AUD_USD')
    .order('trade_date', { ascending: false })
    .limit(limitDays);

  if (error) throw new Error(error.message);
  return (data ?? []) as AmdState[];
}
