'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  fetchRebuildHourGateEnabled,
  writeRebuildHourGateEnabled,
} from '@/lib/rebuildHourGateConfig';

const SYNC_MS = 15_000;
const TOAST_MS = 4000;

export function useRebuildHourGate() {
  const [hourGateEnabled, setHourGateEnabled] = useState(true);
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
      const enabled = await fetchRebuildHourGateEnabled(getSupabase());
      setHourGateEnabled(enabled);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setHourGateEnabled(true);
    }
  }, []);

  useEffect(() => {
    void sync();
    const interval = window.setInterval(() => void sync(), SYNC_MS);
    return () => window.clearInterval(interval);
  }, [sync]);

  const toggleHourGate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const next = !hourGateEnabled;
    try {
      await writeRebuildHourGateEnabled(getSupabase(), next);
      setHourGateEnabled(next);
      showToast(
        next ? 'Rebuild: hour filter ON' : 'Rebuild: hour filter OFF (bridge)'
      );
      void sync();
    } catch (e) {
      showToast(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, hourGateEnabled, showToast, sync]);

  return {
    hourGateEnabled,
    loadError,
    toast,
    busy,
    toggleHourGate,
    sync,
  };
}
