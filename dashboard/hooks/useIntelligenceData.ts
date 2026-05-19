'use client';

import { useCallback, useEffect, useState } from 'react';
import type { IntelligenceData } from '@/lib/intelligenceTypes';
import { fetchIntelligenceData } from '@/lib/fetchIntelligenceData';

export interface UseIntelligenceDataResult {
  data: IntelligenceData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useIntelligenceData(): UseIntelligenceDataResult {
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchIntelligenceData();
      setData(result);
    } catch (fetchErr: unknown) {
      setError(fetchErr instanceof Error ? fetchErr.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, tick]);

  return {
    data,
    loading,
    error,
    refetch: () => setTick((t) => t + 1),
  };
}
