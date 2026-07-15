'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { OMEGA_CENTROID_HEALTH_REFRESH_MS } from '@/lib/omegaCentroidConstants';
import { fetchOmegaCentroidHealth } from '@/lib/fetchOmegaCentroidHealth';
import {
  computeOmegaCentroidHealthStats,
  type CentroidFireSample,
  type OmegaCentroidHealthStats,
} from '@/lib/omegaCentroidHealthStats';

export function useOmegaCentroidHealth() {
  const [fires, setFires] = useState<CentroidFireSample[]>([]);
  const [stats, setStats] = useState<OmegaCentroidHealthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await fetchOmegaCentroidHealth(getSupabase());
    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
    } else {
      setErrorMessage(null);
      setFires(result.fires);
      setStats(computeOmegaCentroidHealthStats(result.fires));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const intervalId = window.setInterval(
      () => void reload(),
      OMEGA_CENTROID_HEALTH_REFRESH_MS,
    );
    return () => window.clearInterval(intervalId);
  }, [reload]);

  return { fires, stats, loading, errorMessage, reload };
}
