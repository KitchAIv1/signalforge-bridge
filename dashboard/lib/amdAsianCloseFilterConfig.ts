import type { SupabaseClient } from '@supabase/supabase-js';

export const KEY_AMD_ASIAN_CLOSE_FILTER_ENABLED = 'amd_asian_close_filter_enabled';

export function parseAmdAsianCloseFilterEnabled(raw: unknown): boolean {
  return raw === true || raw === 'true';
}

export async function fetchAmdAsianCloseFilterEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', KEY_AMD_ASIAN_CLOSE_FILTER_ENABLED)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseAmdAsianCloseFilterEnabled(data?.config_value);
}

export async function writeAmdAsianCloseFilterEnabled(
  supabase: SupabaseClient,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('bridge_config')
    .update({
      config_value: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq('config_key', KEY_AMD_ASIAN_CLOSE_FILTER_ENABLED);
  if (error) throw new Error(error.message);
}
