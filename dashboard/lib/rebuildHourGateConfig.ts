import type { SupabaseClient } from '@supabase/supabase-js';

/** Matches signalRouter bridge_config key. */
export const KEY_REBUILD_HOUR_GATE_ENABLED = 'rebuild_hour_gate_enabled';

export function parseRebuildHourGateEnabled(raw: unknown): boolean {
  if (raw === false || raw === 'false') return false;
  return true;
}

export async function fetchRebuildHourGateEnabled(
  supabase: SupabaseClient
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', KEY_REBUILD_HOUR_GATE_ENABLED)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseRebuildHourGateEnabled(data?.config_value);
}

export async function writeRebuildHourGateEnabled(
  supabase: SupabaseClient,
  enabled: boolean
): Promise<void> {
  const { error } = await supabase
    .from('bridge_config')
    .update({
      config_value: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq('config_key', KEY_REBUILD_HOUR_GATE_ENABLED);
  if (error) throw new Error(error.message);
}
