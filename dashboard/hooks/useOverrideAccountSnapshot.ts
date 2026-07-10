'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AccountSnapshot } from '@/lib/accountSnapshotService';
import type { OverrideBrokerId } from '@/lib/overrideBrokerScope';
import { parseOverrideApiError } from '@/lib/parseOverrideApiError';

const POLL_MS = 15_000;
const STALE_AFTER_MS = 45_000;
const STALE_TICK_MS = 10_000;

export function useOverrideAccountSnapshot(brokerId: OverrideBrokerId) {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refreshSnapshot = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/override/account?brokerId=${encodeURIComponent(brokerId)}`,
      );
      if (!res.ok) {
        throw new Error(await parseOverrideApiError(res, 'Account fetch'));
      }
      const data = (await res.json()) as { snapshot: AccountSnapshot };
      setSnapshot(data.snapshot);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(String(err));
    }
  }, [brokerId]);

  useEffect(() => {
    void refreshSnapshot();
    const pollId = window.setInterval(() => void refreshSnapshot(), POLL_MS);
    return () => window.clearInterval(pollId);
  }, [refreshSnapshot]);

  useEffect(() => {
    const tickId = window.setInterval(() => setNowMs(Date.now()), STALE_TICK_MS);
    return () => window.clearInterval(tickId);
  }, []);

  const isStale =
    snapshot != null &&
    nowMs - new Date(snapshot.checkedAt).getTime() > STALE_AFTER_MS;

  return { snapshot, isStale, errorMessage };
}
