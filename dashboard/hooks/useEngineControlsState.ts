'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  fetchEngineControlRows,
  writeOmegaDir,
  writePaused,
  writeRebuildRetry,
} from '@/lib/engineControlConfig';

const TOAST_MS = 4000;

export function useEngineControlsState() {
  const [pausedIds, setPausedIds] = useState<string[]>([]);
  const [omegaDir, setOmegaDir] = useState<'long' | 'short'>('long');
  const [rebuildRetry, setRebuildRetry] = useState(false);
  const [lastSyncedUtc, setLastSyncedUtc] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const sync = useCallback(async () => {
    setLoadError(null);
    try {
      const client = getSupabase();
      const row = await fetchEngineControlRows(client);
      setPausedIds(row.pausedIds);
      setOmegaDir(row.omegaDir);
      setRebuildRetry(row.rebuildRetry);
      setLastSyncedUtc(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void sync();
    const syncInterval = window.setInterval(() => void sync(), 15_000);
    return () => clearInterval(syncInterval);
  }, [sync]);

  const togglePause = useCallback(
    async (engineId: string, display: string) => {
      const isPaused = pausedIds.includes(engineId);
      const next = isPaused ? pausedIds.filter((e) => e !== engineId) : [...pausedIds, engineId];
      try {
        await writePaused(getSupabase(), next);
        setPausedIds(next);
        showToast(
          isPaused
            ? display === 'Omega'
              ? 'Omega resumed'
              : `${display} resumed`
            : display === 'Omega'
              ? 'Omega paused — takes effect on next signal'
              : `${display} paused — takes effect on next signal`
        );
        void sync();
      } catch (e) {
        showToast(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [pausedIds, showToast, sync]
  );

  const flipOmega = useCallback(async () => {
    const nextDir: 'long' | 'short' = omegaDir === 'long' ? 'short' : 'long';
    try {
      await writeOmegaDir(getSupabase(), nextDir);
      setOmegaDir(nextDir);
      showToast(nextDir === 'short' ? 'Omega → SHORT' : 'Omega → LONG');
      void sync();
    } catch (e) {
      showToast(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [omegaDir, showToast, sync]);
  const toggleRebuildRetry = useCallback(async () => {
    const next = !rebuildRetry;
    try {
      await writeRebuildRetry(getSupabase(), next);
      setRebuildRetry(next);
      showToast(next ? 'Rebuild: slip retry ON' : 'Rebuild: slip retry OFF');
      void sync();
    } catch (e) {
      showToast(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [rebuildRetry, showToast, sync]);
  return { pausedIds, omegaDir, rebuildRetry, lastSyncedUtc, toast, loadError, togglePause, flipOmega, toggleRebuildRetry };
}
