'use client';

import { useEffect, useState } from 'react';
import type { AmdState } from '@/lib/types';
import { fetchAudUsdTodayAmdState } from '@/lib/fetchAudUsdTodayAmdState';
import { usePollingInterval } from '@/hooks/usePollingInterval';

const REFRESH_MS = 5 * 60 * 1000;

export interface UseAmdStateResult {
  amdState: AmdState | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAmdState(): UseAmdStateResult {
  const [amdState, setAmdState] = useState<AmdState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const nextRow = await fetchAudUsdTodayAmdState();
        if (!cancelled) setAmdState(nextRow);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  usePollingInterval(() => setTick((t) => t + 1), REFRESH_MS, { runImmediately: false });

  return {
    amdState,
    loading,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}
