/**
 * RAW Omega fixed pip peak-giveback trail distance.
 * trail_stop_state.trail_distance is absolute price distance from peak.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OMEGA_TRAIL_PEAK_GIVEBACK_PIPS_CONFIG_KEY,
} from './omegaRawConstants.js';

function pipSizeForPair(pair: string): number {
  const normalized = pair.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return normalized.includes('JPY') ? 0.01 : 0.0001;
}

/**
 * Read peak-giveback pips from bridge_config.
 * Returns null when unset/invalid → caller keeps legacy 0.5R trail.
 */
export async function loadOmegaTrailPeakGivebackPips(
  supabase: SupabaseClient,
): Promise<number | null> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', OMEGA_TRAIL_PEAK_GIVEBACK_PIPS_CONFIG_KEY)
    .maybeSingle();
  if (error || data == null) return null;
  const raw = data.config_value;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Absolute trail lock distance in price for a fixed pip giveback. */
export function omegaPeakGivebackPriceDistance(
  peakGivebackPips: number,
  pair: string,
): number {
  return peakGivebackPips * pipSizeForPair(pair);
}
