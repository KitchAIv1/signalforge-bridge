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
import type { AsianSessionDetection } from '@/lib/directionDecisionTypes';

const LOG_SELECT =
  'trade_date, triggered_at, amd_tag, prior_d1_direction, direction_set, ' +
  'previous_direction, direction_changed, action, reason, asian_session_result, created_at';

function lookbackTradeDate(days: number): string {
  const stamp = new Date();
  stamp.setUTCDate(stamp.getUTCDate() - days);
  return stamp.toISOString().slice(0, 10);
}

export async function fetchAsianDirectionLog(): Promise<AsianDirectionLogEntry[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('asian_direction_log')
    .select(LOG_SELECT)
    .gte('trade_date', lookbackTradeDate(14))
    .order('triggered_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AsianDirectionLogEntry[];
}

const DETECTION_LOG_SELECT =
  'id, trade_date, condition_fired, condition_check_time, ' +
  'detection_bar, detection_direction, detection_net_pips, ' +
  'prior_amd_shifted, prior_amd_tag, size_multiplier, ' +
  'confidence_tier, prior_direction_bias, ' +
  'action, direction_set, valid_until, candle_count, ' +
  'error_message, created_at';

export async function fetchAsianSessionDetectionLog(): Promise<AsianSessionDetection[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('asian_session_detection_log')
    .select(DETECTION_LOG_SELECT)
    .gte('trade_date', lookbackTradeDate(7))
    .order('created_at', { ascending: false })
    .limit(56);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AsianSessionDetection[];
}
