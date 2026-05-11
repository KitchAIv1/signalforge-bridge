'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  fetchMinutesSincePresence,
  isWithinPresenceWindow,
  PRESENCE_TIMEOUT_MINUTES,
} from '@/lib/presenceConfig';

const REFRESH_MS = 30_000;

/**
 * Shows watching vs away for omega auto-sizing (reads presence_last_seen).
 */
export function PresenceIndicator() {
  const [isPresent, setIsPresent] = useState(true);
  const [minutesSince, setMinutesSince] = useState(0);

  useEffect(() => {
    async function checkPresence(): Promise<void> {
      const supabase = getSupabase();
      const mins = await fetchMinutesSincePresence(supabase);
      setMinutesSince(Math.round(mins));
      setIsPresent(isWithinPresenceWindow(mins));
    }

    void checkPresence();
    const interval = window.setInterval(() => void checkPresence(), REFRESH_MS);
    return () => window.clearInterval(interval);
  }, []);

  if (isPresent) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 dark:border-green-800 dark:bg-green-900/20">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
        <span className="text-xs font-medium text-green-700 dark:text-green-400">
          Watching — full size
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 dark:border-amber-800 dark:bg-amber-900/20"
      title={`Last active ${minutesSince}m ago — auto-sizing active after ${PRESENCE_TIMEOUT_MINUTES}m`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
        Away {minutesSince}m — auto-sizing on
      </span>
    </div>
  );
}
