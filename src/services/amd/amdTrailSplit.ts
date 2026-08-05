/**
 * ENGINE_AMD pip-trail exit decision with independent arm / giveback
 * distances. Legacy behavior (split flag OFF) passes the same value for
 * both, which is mathematically identical to the original coupled trail.
 * Replay evidence (49 live trades, OANDA M5 paths): arm 6 / giveback 4
 * is the robust optimum — +26.5p vs coupled 5/5 on identical paths;
 * givebacks of 8-10 lose the whole edge (-87p). Pure function, no I/O.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AMD_TRAIL_SPLIT_ENABLED_CONFIG_KEY } from './amdTrailConstants.js';

const PIP_SIZE = 0.0001;

/**
 * True when the trail exit should fire: peak gain has reached armPips and
 * price has retreated givebackPips from the peak favorable price.
 */
export function amdTrailExitFired(
  direction: 'long' | 'short',
  fillPrice: number,
  peakPrice: number,
  currentPrice: number,
  armPips: number,
  givebackPips: number,
): boolean {
  const peakGainPips =
    direction === 'long'
      ? (peakPrice - fillPrice) / PIP_SIZE
      : (fillPrice - peakPrice) / PIP_SIZE;
  if (peakGainPips < armPips) return false;
  const givebackDistance = givebackPips * PIP_SIZE;
  const trailExitLevel =
    direction === 'long' ? peakPrice - givebackDistance : peakPrice + givebackDistance;
  return direction === 'long'
    ? currentPrice <= trailExitLevel
    : currentPrice >= trailExitLevel;
}

/** Defaults to false on missing row/error — legacy coupled trail stays active. */
export async function isAmdTrailSplitEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', AMD_TRAIL_SPLIT_ENABLED_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return false;
  return data.config_value === true || data.config_value === 'true';
}
