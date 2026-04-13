'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { OmegaShadowSignalRow, OmegaWeeklyReportRow } from '@/lib/types';
import { REFRESH_MS } from '@/lib/omegaShadowConstants';

export function useOmegaShadowData() {
  const [signals, setSignals] = useState<OmegaShadowSignalRow[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<OmegaWeeklyReportRow | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  const fetchShadowPayload = useCallback(async () => {
    const supabase = getSupabase();
    const [signalsRes, weeklyRes] = await Promise.all([
      supabase
        .from('omega_shadow_signals')
        .select('*')
        .order('fired_at', { ascending: false })
        .limit(500),
      supabase
        .from('omega_shadow_weekly_report')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (signalsRes.data) {
      setSignals(signalsRes.data as OmegaShadowSignalRow[]);
    }
    if (weeklyRes.data) {
      setWeeklyReport(weeklyRes.data as OmegaWeeklyReportRow);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchShadowPayload();
    const ticker = setInterval(fetchShadowPayload, REFRESH_MS);
    return () => clearInterval(ticker);
  }, [fetchShadowPayload]);

  return { signals, weeklyReport, loading };
}
