import type { SupabaseClient } from '@supabase/supabase-js';

function parseConfigString(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw.replace(/^"|"$/g, '');
  return String(raw);
}

export async function getBridgeConfigValue(
  supabase: SupabaseClient,
  configKey: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', configKey)
    .maybeSingle();

  if (error || !data) return null;
  return parseConfigString(data.config_value);
}

export async function setBridgeConfigValues(
  supabase: SupabaseClient,
  values: Record<string, string>,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  for (const [configKey, configValue] of Object.entries(values)) {
    const { error } = await supabase
      .from('bridge_config')
      .update({ config_value: configValue, updated_at: updatedAt })
      .eq('config_key', configKey);
    if (error) {
      console.error(`[AsianDetection] Failed to write ${configKey}:`, error.message);
    }
  }
}

export async function writeBridgeConfigKey(
  supabase: SupabaseClient,
  configKey: string,
  configValue: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('bridge_config')
    .update({
      config_value: configValue,
      updated_at: new Date().toISOString(),
    })
    .eq('config_key', configKey);

  if (error) {
    console.error(`[AsianDetection] Failed to write ${configKey}:`, error.message);
    return false;
  }
  return true;
}
