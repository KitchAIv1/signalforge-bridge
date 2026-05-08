'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import {
  fetchLatestAccountSnapshot,
  type AccountSnapshot,
} from '@/lib/accountSnapshotService';

const POLL_MS = 30_000;
const STALE_AFTER_MS = 60_000;
const STALE_TICK_MS = 10_000;

export function useAccountSnapshot() {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refreshSnapshot = useCallback(async () => {
    try {
      const nextSnapshot = await fetchLatestAccountSnapshot(getSupabase());
      setSnapshot(nextSnapshot);
    } catch {
      setSnapshot(null);
    }
  }, []);

  useEffect(() => {
    void refreshSnapshot();
    const pollId = window.setInterval(() => void refreshSnapshot(), POLL_MS);
    return () => window.clearInterval(pollId);
  }, [refreshSnapshot]);

  useEffect(() => {
    const tickId = window.setInterval(() => setNowMs(Date.now()), STALE_TICK_MS);
    return () => window.clearInterval(tickId);
  }, []);

  const lastUpdated = snapshot?.checkedAt ?? null;
  const isStale =
    snapshot != null &&
    nowMs - new Date(snapshot.checkedAt).getTime() > STALE_AFTER_MS;

  return { snapshot, lastUpdated, isStale };
}
