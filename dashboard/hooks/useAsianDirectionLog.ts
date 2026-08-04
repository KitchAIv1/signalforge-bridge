'use client';

import { useEffect, useState } from 'react';
import {
  fetchAsianDirectionLog,
  type AsianDirectionLogEntry,
} from '@/lib/fetchAsianDirectionLog';
import { usePollingInterval } from '@/hooks/usePollingInterval';

const REFRESH_MS = 60 * 1000;

export interface UseAsianDirectionLogResult {
  logRows: AsianDirectionLogEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useAsianDirectionLog(): UseAsianDirectionLogResult {
  const [logRows, setLogRows] = useState<AsianDirectionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const nextRows = await fetchAsianDirectionLog();
        if (!cancelled) setLogRows(nextRows);
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
    logRows,
    loading,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}
