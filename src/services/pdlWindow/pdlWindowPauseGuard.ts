import { getSupabaseClient } from '../../connectors/supabase.js';
import { PDL_WINDOW_ENGINE_ID } from './pdlWindowConstants.js';

export async function isPdlWindowPaused(): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', 'paused_engines')
    .maybeSingle();

  if (error || data?.config_value == null) return false;

  const raw = data.config_value;
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return false;
    }
  }
  if (!Array.isArray(list)) return false;
  return list.map(String).includes(PDL_WINDOW_ENGINE_ID);
}
