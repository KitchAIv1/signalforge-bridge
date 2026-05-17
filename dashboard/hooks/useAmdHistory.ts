'use client';

import { useEffect, useState } from 'react';
import type { AmdState } from '@/lib/types';
import { fetchAmdHistory } from '@/lib/fetchAmdHistory';

export interface UseAmdHistoryResult {
  rows: AmdState[];
  loading: boolean;
  error: string | null;
}

export function useAmdHistory(): UseAmdHistoryResult {
  const [rows, setRows] = useState<AmdState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAmdHistory(300);
        if (!cancelled) setRows(data);
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
  }, []);

  return { rows, loading, error };
}
