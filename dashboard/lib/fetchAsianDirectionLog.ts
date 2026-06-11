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
import type { AsianSessionDetection, D1ContextConfig, D1MomentumSignal } from '@/lib/directionDecisionTypes';
import { EMPTY_D1_CONTEXT_CONFIG } from '@/lib/d1ContextHelpers';

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

export async function fetchAsianSessionDetectionLog(
  lookbackDays = 90,
): Promise<AsianSessionDetection[]> {
  const supabase = getSupabase();
  const rowLimit = lookbackDays * 4;
  const { data, error } = await supabase
    .from('asian_session_detection_log')
    .select(DETECTION_LOG_SELECT)
    .gte('trade_date', lookbackTradeDate(lookbackDays))
    .order('trade_date', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(rowLimit);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AsianSessionDetection[];
}

const D1_CONTEXT_KEYS = [
  'd1_prior_direction',
  'd1_prior_net_pips',
  'd1_prior_body_pct',
  'd1_prior_close_pos_pct',
  'd1_momentum_signal',
] as const;

function parseD1Direction(value: unknown): D1ContextConfig['d1_prior_direction'] {
  if (value === 'long' || value === 'short' || value === 'equal') return value;
  return null;
}

function parseD1MomentumSignal(value: unknown): D1MomentumSignal | null {
  if (
    value === 'STRONG_CONTINUATION' ||
    value === 'WEAK_CONTINUATION' ||
    value === 'EXHAUSTION_BUILDING' ||
    value === 'NEUTRAL'
  ) {
    return value;
  }
  return null;
}

function parseConfigString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const text = value.replace(/^"|"$/g, '').trim();
    return text.length > 0 ? text : null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export async function fetchD1ContextConfig(): Promise<D1ContextConfig> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_key, config_value')
    .in('config_key', [...D1_CONTEXT_KEYS]);

  if (error) throw new Error(error.message);

  const configMap = Object.fromEntries(
    (data ?? []).map((row) => [row.config_key as string, row.config_value]),
  );

  return {
    d1_prior_direction: parseD1Direction(configMap.d1_prior_direction),
    d1_prior_net_pips: parseConfigString(configMap.d1_prior_net_pips),
    d1_prior_body_pct: parseConfigString(configMap.d1_prior_body_pct),
    d1_prior_close_pos_pct: parseConfigString(configMap.d1_prior_close_pos_pct),
    d1_momentum_signal: parseD1MomentumSignal(configMap.d1_momentum_signal),
  };
}

export function mergeD1ContextIntoDetection<T extends AsianSessionDetection>(
  row: T,
  d1Config: D1ContextConfig,
): T {
  return {
    ...row,
    d1_prior_direction: d1Config.d1_prior_direction,
    d1_momentum_signal: d1Config.d1_momentum_signal,
  };
}

export { EMPTY_D1_CONTEXT_CONFIG };
