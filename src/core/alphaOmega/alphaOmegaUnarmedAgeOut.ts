/**
 * Unarmed streak age-out — hygiene only.
 * If !armed and minutes(streakStart → fire) > ENTRY_SPEED_CEILING_MIN (45),
 * force a fresh streak. Armed streaks never reset here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ALPHAOMEGA_UNARMED_AGEOUT_ENABLED_CONFIG_KEY,
  ENTRY_SPEED_CEILING_MIN,
} from './alphaOmegaConstants.js';

export function minutesBetweenIso(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 60_000;
}

/** Pure predicate — armed streaks always false. */
export function shouldResetUnarmedStreakForAge(input: {
  armed: boolean;
  streakStartAt: string | null;
  fireAt: string;
  enabled?: boolean;
}): boolean {
  if (input.enabled === false) return false;
  if (input.armed) return false;
  if (input.streakStartAt == null) return false;
  return minutesBetweenIso(input.streakStartAt, input.fireAt) > ENTRY_SPEED_CEILING_MIN;
}

/**
 * Kill switch. Missing row / error → enabled (hygiene on by default).
 * Set bridge_config alpha_omega_unarmed_ageout_enabled = false to disable without redeploy.
 */
export async function isAlphaOmegaUnarmedAgeOutEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', ALPHAOMEGA_UNARMED_AGEOUT_ENABLED_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return true;
  if (data.config_value === false || data.config_value === 'false') return false;
  return true;
}
