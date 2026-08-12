/** bridge_config kill-switch — default OFF (fail-closed). */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../connectors/supabase.js';

export const PEAK_FADE_ENABLED_CONFIG_KEY = 'peak_fade_enabled';

export async function isPeakFadeConfigEnabled(
  supabase: SupabaseClient = getSupabaseClient(),
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', PEAK_FADE_ENABLED_CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return false;
  return data.config_value === true || data.config_value === 'true';
}
