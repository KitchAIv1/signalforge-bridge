import type { SupabaseClient } from '@supabase/supabase-js';

export const KEY_PAUSED = 'paused_engines';
export const KEY_OMEGA_DIR = 'omega_direction';
/** Must match signalRouter bridge_config read for rebuild_bounds_retry */
export const KEY_REBUILD_RETRY = 'rebuild_bounds_retry';

export function parseOmegaDir(raw: unknown): 'long' | 'short' {
  if (raw === 'short' || raw === 'SHORT') return 'short';
  if (typeof raw === 'string' && raw.toLowerCase() === 'short') return 'short';
  return 'long';
}

export function parsePaused(raw: unknown): string[] {
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
    return raw as string[];
  }
  return [];
}

export function parseRebuildRetry(raw: unknown): boolean {
  return raw === true;
}

type ConfigRow = { config_key: string; config_value: unknown };

export async function fetchEngineControlRows(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_key, config_value')
    .in('config_key', [KEY_PAUSED, KEY_OMEGA_DIR, KEY_REBUILD_RETRY]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ConfigRow[];
  const pa = rows.find((r) => r.config_key === KEY_PAUSED);
  const om = rows.find((r) => r.config_key === KEY_OMEGA_DIR);
  const br = rows.find((r) => r.config_key === KEY_REBUILD_RETRY);
  return {
    pausedIds: parsePaused(pa?.config_value),
    omegaDir: parseOmegaDir(om?.config_value),
    rebuildRetry: parseRebuildRetry(br?.config_value),
  };
}

export async function writePaused(supabase: SupabaseClient, ids: string[]) {
  const { error } = await supabase
    .from('bridge_config')
    .update({ config_value: ids, updated_at: new Date().toISOString() })
    .eq('config_key', KEY_PAUSED);
  if (error) throw new Error(error.message);
}

export async function writeOmegaDir(supabase: SupabaseClient, dir: 'long' | 'short') {
  const { error } = await supabase
    .from('bridge_config')
    .update({ config_value: dir, updated_at: new Date().toISOString() })
    .eq('config_key', KEY_OMEGA_DIR);
  if (error) throw new Error(error.message);
}

export async function writeRebuildRetry(supabase: SupabaseClient, enabled: boolean) {
  const { error } = await supabase
    .from('bridge_config')
    .update({ config_value: enabled, updated_at: new Date().toISOString() })
    .eq('config_key', KEY_REBUILD_RETRY);
  if (error) throw new Error(error.message);
}
