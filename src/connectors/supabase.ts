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

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      getRequiredEnv('SUPABASE_URL'),
      getRequiredEnv('SUPABASE_SERVICE_KEY')
    );
  }
  return _client;
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
 * Adds status callback and automatic reconnection on CHANNEL_ERROR, TIMED_OUT, CLOSED.
 * Returns a channel; call channel.unsubscribe() to stop.
 */
export function subscribeToSignalInserts(
  supabase: SupabaseClient,
  onInsert: OnSignalInsertCallback
): RealtimeChannel {
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let currentChannel: RealtimeChannel;
  let attemptCount = 0;
  const MAX_ATTEMPTS = 10;
  const RECONNECT_DELAY_MS = 5000;

  function clearReconnectTimer(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function createAndSubscribe(): RealtimeChannel {
    const channelName = `bridge:${SIGNAL_TABLE}:${Date.now()}`;

    const ch = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: SIGNAL_TABLE },
        (payload) => {
          const newRow = payload.new as SignalInsertPayload;
          void Promise.resolve(onInsert(newRow)).catch((err) => {
            console.error('[Bridge] Signal handler error:', err);
          });
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          attemptCount = 0;
          clearReconnectTimer();
          console.log('[Bridge] Realtime subscription active ✅');
          return;
        }

        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          console.error(
            `[Bridge] Realtime ${status}:`,
            err?.message ?? 'no details'
          );

          if (attemptCount >= MAX_ATTEMPTS) {
            console.error(
              '[Bridge] Max reconnect attempts reached. Manual restart required.'
            );
            return;
          }

          attemptCount++;
          console.log(
            `[Bridge] Reconnecting in ${RECONNECT_DELAY_MS}ms ` +
              `(attempt ${attemptCount}/${MAX_ATTEMPTS})...`
          );

          clearReconnectTimer();
          reconnectTimer = setTimeout(() => {
            void supabase.removeChannel(currentChannel).catch(() => {});
            currentChannel = createAndSubscribe();
          }, RECONNECT_DELAY_MS);
        }
      });

    return ch;
  }

  currentChannel = createAndSubscribe();
  return currentChannel;
}
