'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchAlphaOmegaLiveState,
} from '@/lib/fetchAlphaOmegaLiveState';
import type {
  AlphaOmegaOpenPositionSnapshot,
  AlphaOmegaStreakSnapshot,
} from '@/lib/alphaOmegaLiveStateMap';
import type { AlphaOmegaLastExitSnapshot } from '@/lib/reconcileAlphaOmegaOpenPosition';

export type { AlphaOmegaOpenPositionSnapshot, AlphaOmegaStreakSnapshot, AlphaOmegaLastExitSnapshot };

const POLL_MS = 15_000;

export interface AlphaOmegaLiveState {
  streak: AlphaOmegaStreakSnapshot | null;
  openPosition: AlphaOmegaOpenPositionSnapshot | null;
  lastExit: AlphaOmegaLastExitSnapshot | null;
  loading: boolean;
  errorMessage: string | null;
}

export function useAlphaOmegaLiveState(): AlphaOmegaLiveState {
  const [streak, setStreak] = useState<AlphaOmegaStreakSnapshot | null>(null);
  const [openPosition, setOpenPosition] = useState<AlphaOmegaOpenPositionSnapshot | null>(null);
  const [lastExit, setLastExit] = useState<AlphaOmegaLastExitSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await fetchAlphaOmegaLiveState();
    setStreak(result.streak);
    setOpenPosition(result.openPosition);
    setLastExit(result.lastExit);
    setErrorMessage(result.errorMessage);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const pollId = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(pollId);
  }, [refresh]);

  return { streak, openPosition, lastExit, loading, errorMessage };
}
