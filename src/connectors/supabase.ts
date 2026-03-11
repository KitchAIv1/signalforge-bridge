/**
 * Supabase client and Realtime subscription to SIGNAL_TABLE (INSERT only).
 * Read-only on signals and signal_outcomes; bridge writes only to bridge_* tables.
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export function getSupabaseClient(): SupabaseClient {
  return createClient(getRequiredEnv('SUPABASE_URL'), getRequiredEnv('SUPABASE_SERVICE_KEY'));
}

const SIGNAL_TABLE = process.env.SIGNAL_TABLE ?? 'signals';

export function getSignalTableName(): string {
  return SIGNAL_TABLE;
}

export type SignalInsertPayload = Record<string, unknown> & {
  id?: string;
  engine_id?: string;
  provider_id?: string;
  pair?: string;
  direction?: string;
  confluence_score?: number;
  entry_zone_low?: number;
  entry_zone_high?: number;
  stop_loss?: number;
  take_profit?: number;
  target_1?: number;
  stop_loss_pips?: number;
  created_at?: string;
  regime?: string;
};

export type OnSignalInsertCallback = (payload: SignalInsertPayload) => void | Promise<void>;

/**
 * Subscribe to Realtime INSERT events on the signals table.
 * Returns a channel; call channel.unsubscribe() to stop.
 */
export function subscribeToSignalInserts(
  supabase: SupabaseClient,
  onInsert: OnSignalInsertCallback
): RealtimeChannel {
  const channel = supabase
    .channel(`bridge:${SIGNAL_TABLE}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: SIGNAL_TABLE },
      (payload) => {
        const newRow = payload.new as SignalInsertPayload;
        void Promise.resolve(onInsert(newRow)).catch((err) => {
          console.error('Error in signal insert handler:', err);
        });
      }
    )
    .subscribe();
  return channel;
}
