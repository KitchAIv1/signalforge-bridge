'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  fetchAmdAsianCloseFilterEnabled,
  writeAmdAsianCloseFilterEnabled,
} from '@/lib/amdAsianCloseFilterConfig';

const SYNC_MS = 15_000;
const TOAST_MS = 4000;

export function useAmdAsianCloseFilter() {
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const sync = useCallback(async () => {
    setLoadError(null);
    try {
      const enabled = await fetchAmdAsianCloseFilterEnabled(getSupabase());
      setFilterEnabled(enabled);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setFilterEnabled(false);
    }
  }, []);

  useEffect(() => {
    void sync();
    const interval = window.setInterval(() => void sync(), SYNC_MS);
    return () => window.clearInterval(interval);
  }, [sync]);

  const toggleFilter = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const next = !filterEnabled;
    try {
      await writeAmdAsianCloseFilterEnabled(getSupabase(), next);
      setFilterEnabled(next);
      showToast(
        next ? 'AMD: Asian close filter ON' : 'AMD: Asian close filter OFF',
      );
      void sync();
    } catch (e) {
      showToast(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, filterEnabled, showToast, sync]);

  return {
    filterEnabled,
    loadError,
    toast,
    busy,
    toggleFilter,
    sync,
  };
}

export type AmdAsianCloseFilterControl = ReturnType<typeof useAmdAsianCloseFilter>;
