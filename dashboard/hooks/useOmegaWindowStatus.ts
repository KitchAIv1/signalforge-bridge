'use client';
import { useEffect, useState } from 'react';
import {
  fetchOmegaWindowStatus,
  type OmegaWindowStatus,
} from '@/lib/fetchOmegaWindowStatus';

const REFRESH_MS = 60 * 1000;

export interface UseOmegaWindowStatusResult {
  status: OmegaWindowStatus | null;
  loading: boolean;
  error: string | null;
}

export function useOmegaWindowStatus(): UseOmegaWindowStatusResult {
  const [status, setStatus] = useState<OmegaWindowStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchOmegaWindowStatus();
        if (!cancelled) setStatus(next);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const interval = window.setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [tick]);

  return { status, loading, error };
}
