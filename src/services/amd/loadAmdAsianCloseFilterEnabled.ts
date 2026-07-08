import type { SupabaseClient } from '@supabase/supabase-js';

const CONFIG_KEY = 'amd_asian_close_filter_enabled';
const CACHE_TTL_MS = 60_000;

let cachedEnabled: boolean | null = null;
let cacheExpiresAt = 0;

function parseBool(raw: unknown): boolean {
  return raw === true || raw === 'true';
}

async function readConfigFlag(supabase: SupabaseClient): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', CONFIG_KEY)
    .maybeSingle();
  if (error || !data) return null;
  return parseBool(data.config_value);
}

export async function loadAmdAsianCloseFilterEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  const now = Date.now();
  if (cachedEnabled !== null && now < cacheExpiresAt) return cachedEnabled;

  const fromConfig = await readConfigFlag(supabase);
  const enabled =
    fromConfig !== null
      ? fromConfig
      : process.env.AMD_ASIAN_CLOSE_FILTER_ENABLED === 'true';

  cachedEnabled = enabled;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return enabled;
}
