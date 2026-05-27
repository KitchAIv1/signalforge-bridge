export interface AsianDirectionLogEntry {
  trade_date: string;
  triggered_at: string;
  amd_tag: string | null;
  prior_d1_direction: string | null;
  direction_set: string | null;
  previous_direction: string | null;
  direction_changed: boolean | null;
  action: string;
  reason: string;
  asian_session_result: string | null;
  created_at: string;
}

import { getSupabase } from '@/lib/supabase';

const DIRECTION_SET_SELECT =
  'trade_date, triggered_at, amd_tag, prior_d1_direction, direction_set, ' +
  'previous_direction, direction_changed, action, reason, asian_session_result, created_at';

export async function fetchAsianDirectionLog(): Promise<AsianDirectionLogEntry[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('asian_direction_log')
    .select(DIRECTION_SET_SELECT)
    .eq('trigger_type', 'DIRECTION_SET')
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AsianDirectionLogEntry[];
}
