/**
 * Presence configuration and write helper.
 * Same pattern as engineControlConfig.ts.
 * Omega auto-sizing reads presence_last_seen from bridge_config.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const KEY_PRESENCE = 'presence_last_seen';
export const PRESENCE_TIMEOUT_MINUTES = 30;
export const PRESENCE_PING_INTERVAL_MS = 60_000;

/** Writes current timestamp to bridge_config presence row */
export async function writePresencePing(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from('bridge_config')
    .update({
      config_value: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('config_key', KEY_PRESENCE);
  if (error) throw new Error(error.message);
}

/** Reads presence_last_seen and returns minutes since last ping */
export async function fetchMinutesSincePresence(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', KEY_PRESENCE)
    .single();

  if (error || !data?.config_value) return 999;

  const raw = data.config_value;
  const lastSeen = new Date(typeof raw === 'string' ? raw : String(raw)).getTime();
  if (Number.isNaN(lastSeen)) return 999;

  return (Date.now() - lastSeen) / 60_000;
}

/** True if presence ping was within timeout window */
export function isWithinPresenceWindow(minutesSince: number): boolean {
  return minutesSince <= PRESENCE_TIMEOUT_MINUTES;
}
