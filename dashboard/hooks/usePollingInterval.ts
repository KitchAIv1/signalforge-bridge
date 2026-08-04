'use client';

import { useEffect, useRef } from 'react';

interface PollingIntervalOptions {
  /** Fire the callback once on mount (default true). */
  runImmediately?: boolean;
}

/**
 * Visibility-aware polling: runs `poll` every `intervalMs`, but skips ticks
 * while the tab is hidden so unattended tabs stop burning Supabase egress.
 * When the tab becomes visible again after missing at least one tick, fires
 * one immediate refresh so the UI catches up.
 */
export function usePollingInterval(
  poll: () => void,
  intervalMs: number,
  options: PollingIntervalOptions = {},
): void {
  const pollRef = useRef(poll);
  pollRef.current = poll;
  const runImmediately = options.runImmediately ?? true;

  useEffect(() => {
    let lastRunMs = 0;

    const runPoll = () => {
      lastRunMs = Date.now();
      pollRef.current();
    };

    if (runImmediately) runPoll();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      runPoll();
    }, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRunMs >= intervalMs) runPoll();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs, runImmediately]);
}
