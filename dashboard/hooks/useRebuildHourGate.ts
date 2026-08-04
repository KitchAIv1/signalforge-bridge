'use client';

import { useCallback, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  fetchRebuildHourGateEnabled,
  writeRebuildHourGateEnabled,
} from '@/lib/rebuildHourGateConfig';
import { usePollingInterval } from '@/hooks/usePollingInterval';

const SYNC_MS = 60_000;
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

  usePollingInterval(() => void sync(), SYNC_MS);

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

export type RebuildHourGateControl = ReturnType<typeof useRebuildHourGate>;
