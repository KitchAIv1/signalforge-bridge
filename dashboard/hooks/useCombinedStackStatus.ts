'use client';

import { useEffect, useState } from 'react';
import {
  fetchCombinedStackStatus,
  type CombinedStackStatusData,
} from '@/lib/fetchCombinedStackStatus';

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Read-only poll for the Combined Stack status card. Refreshes every 60s
 * while the tab is visible; silent on errors (keeps last good snapshot).
 */
export function useCombinedStackStatus(): CombinedStackStatusData | null {
  const [statusData, setStatusData] = useState<CombinedStackStatusData | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const snapshot = await fetchCombinedStackStatus();
        if (!cancelled) setStatusData(snapshot);
      } catch {
        // Display-only card — keep the last good snapshot on transient errors.
      }
    };

    void load();
    const intervalId = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return statusData;
}
