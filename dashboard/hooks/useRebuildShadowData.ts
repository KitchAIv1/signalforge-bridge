'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { RebuildShadowSignalRow, RebuildWeeklyReportRow } from '@/lib/types';
import { REBUILD_REFRESH_MS } from '@/lib/rebuildShadowConstants';

const FETCH_LIMIT = 2000;

export function useRebuildShadowData() {
  const [signals, setSignals] = useState<RebuildShadowSignalRow[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<RebuildWeeklyReportRow | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPayload = useCallback(async () => {
    const supabase = getSupabase();
    const [signalsRes, weeklyRes] = await Promise.all([
      supabase
        .from('rebuild_shadow_signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from('rebuild_shadow_weekly_report')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (signalsRes.data) {
      setSignals(signalsRes.data as RebuildShadowSignalRow[]);
    }
    if (weeklyRes.data) {
      setWeeklyReport(weeklyRes.data as RebuildWeeklyReportRow);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchPayload();
    const ticker = setInterval(fetchPayload, REBUILD_REFRESH_MS);
    return () => clearInterval(ticker);
  }, [fetchPayload]);

  return { signals, weeklyReport, loading };
}
