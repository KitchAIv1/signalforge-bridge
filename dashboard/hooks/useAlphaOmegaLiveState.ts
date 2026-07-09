'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { OMEGA_LANE_B_BROKER_ID } from '@/lib/omegaLaneBConstants';
import {
  mapAlphaOmegaPositionRow,
  mapAlphaOmegaStreakRow,
  type AlphaOmegaOpenPositionSnapshot,
  type AlphaOmegaStreakSnapshot,
} from '@/lib/alphaOmegaLiveStateMap';

export type { AlphaOmegaOpenPositionSnapshot, AlphaOmegaStreakSnapshot };

const POLL_MS = 15_000;

export interface AlphaOmegaLiveState {
  streak: AlphaOmegaStreakSnapshot | null;
  openPosition: AlphaOmegaOpenPositionSnapshot | null;
  loading: boolean;
  errorMessage: string | null;
}

export function useAlphaOmegaLiveState(): AlphaOmegaLiveState {
  const [streak, setStreak] = useState<AlphaOmegaStreakSnapshot | null>(null);
  const [openPosition, setOpenPosition] = useState<AlphaOmegaOpenPositionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    const [streakResult, positionResult] = await Promise.all([
      supabase.from('alpha_omega_streak_state').select('*').eq('id', 1).maybeSingle(),
      supabase
        .from('alpha_omega_position_state')
        .select('*')
        .eq('broker_id', OMEGA_LANE_B_BROKER_ID)
        .order('entry_fired_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (streakResult.error || positionResult.error) {
      setErrorMessage(streakResult.error?.message ?? positionResult.error?.message ?? 'Load failed');
      setLoading(false);
      return;
    }

    setStreak(mapAlphaOmegaStreakRow(streakResult.data as Record<string, unknown> | null));
    setOpenPosition(mapAlphaOmegaPositionRow(positionResult.data as Record<string, unknown> | null));
    setErrorMessage(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const pollId = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(pollId);
  }, [refresh]);

  return { streak, openPosition, loading, errorMessage };
}
