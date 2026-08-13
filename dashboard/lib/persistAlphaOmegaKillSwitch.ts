import { getSupabase } from '@/lib/supabase';
import { ALPHAOMEGA_ENABLED_CONFIG_KEY } from '@/lib/omegaLaneBConstants';
import { idleAlphaOmegaStreakRow } from '@/lib/idleAlphaOmegaStreak';

/** Enable: idle streak first. Disable: flip flag first, then idle. */
export async function persistAlphaOmegaKillSwitch(
  nextEnabled: boolean,
): Promise<string | null> {
  const supabase = getSupabase();
  if (nextEnabled) {
    const idleError = await idleAlphaOmegaStreakRow(supabase);
    if (idleError) return idleError;
  }
  const { error } = await supabase
    .from('bridge_config')
    .update({ config_value: nextEnabled, updated_at: new Date().toISOString() })
    .eq('config_key', ALPHAOMEGA_ENABLED_CONFIG_KEY);
  if (error) return error.message;
  if (!nextEnabled) {
    const idleError = await idleAlphaOmegaStreakRow(supabase);
    if (idleError) return idleError;
  }
  return null;
}
