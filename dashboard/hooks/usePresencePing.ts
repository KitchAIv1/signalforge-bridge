'use client';

import { useEffect, useRef } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  writePresencePing,
  PRESENCE_PING_INTERVAL_MS,
} from '@/lib/presenceConfig';

/**
 * Sends bridge_config heartbeat every interval while Activity is mounted.
 * Pauses while tab hidden. Omega auto-sizing can read presence_last_seen.
 */
export function usePresencePing(): void {
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    const supabase = getSupabase();

    async function ping(): Promise<void> {
      try {
        await writePresencePing(supabase);
      } catch {
        // Silent — bridge defaults to away-safe behavior
      }
    }

    void ping();
    intervalRef.current = window.setInterval(() => void ping(), PRESENCE_PING_INTERVAL_MS);

    function handleVisibilityChange(): void {
      if (document.hidden) {
        if (intervalRef.current !== null) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        void ping();
        if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
        intervalRef.current = window.setInterval(
          () => void ping(),
          PRESENCE_PING_INTERVAL_MS
        );
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
