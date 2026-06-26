import { getSupabase } from '@/lib/supabase';
import { ASIAN_SESSION_PAIR } from '@/lib/asianSessionConstants';
import type { AsianSessionAmdMetricsSlice } from '@/lib/asianSessionAmdMetricsTypes';

const AMD_METRICS_SELECT =
  'trade_date, evaluated_at, asian_close_bias_signal, asian_close_position_pct, ' +
  'accumulation_quality_score, asian_shape, asian_retracement_pct, ' +
  'asian_turn_time, asian_turn_position';

export async function fetchAsianSessionAmdMetricsByDates(
  tradeDates: readonly string[],
): Promise<AsianSessionAmdMetricsSlice[]> {
  if (tradeDates.length === 0) return [];

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('amd_state')
    .select(AMD_METRICS_SELECT)
    .eq('pair', ASIAN_SESSION_PAIR)
    .in('trade_date', [...tradeDates]);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AsianSessionAmdMetricsSlice[];
}
