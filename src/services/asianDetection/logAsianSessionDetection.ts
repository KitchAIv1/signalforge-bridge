import type { SupabaseClient } from '@supabase/supabase-js';

export interface AsianSessionDetectionLogRow {
  trade_date: string;
  pair?: string;
  condition_fired?: string | null;
  condition_check_time: string;
  detection_bar?: number | null;
  detection_direction?: string | null;
  detection_net_pips?: number | null;
  prior_amd_shifted?: boolean;
  prior_amd_tag?: string | null;
  size_multiplier?: number | null;
  action: string;
  direction_set?: string | null;
  valid_until?: string | null;
  candle_count?: number | null;
  error_message?: string | null;
}

export async function logAsianSessionDetection(
  supabase: SupabaseClient,
  row: AsianSessionDetectionLogRow,
): Promise<void> {
  const { error } = await supabase.from('asian_session_detection_log').insert({
    pair: 'AUD_USD',
    ...row,
  });
  if (error) {
    console.error('[AsianDetection] Failed to write detection log:', error.message);
  }
}
