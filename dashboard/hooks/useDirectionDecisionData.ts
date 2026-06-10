'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { fetchAudUsdTodayAmdState } from '@/lib/fetchAudUsdTodayAmdState';
import { fetchAsianDirectionLog, fetchAsianSessionDetectionLog } from '@/lib/fetchAsianDirectionLog';
import { findTodayActiveDetection } from '@/lib/asianDetectionDisplayHelpers';
import { fetchOmegaWindowStatus } from '@/lib/fetchOmegaWindowStatus';
import { fetchEngineControlRows } from '@/lib/engineControlConfig';
import { fetchRebuildHourGateEnabled } from '@/lib/rebuildHourGateConfig';
import {
  buildDirectionDecisionSnapshot,
  type DirectionDecisionSnapshot,
} from '@/lib/directionDecisionLogic';
import type { AsianSessionDetection } from '@/lib/directionDecisionTypes';
import type { AmdState, RegimeState, ScalperDayState, ScalperTrade } from '@/lib/types';

const REFRESH_MS = 60 * 1000;

export interface UseDirectionDecisionDataResult {
  snapshot: DirectionDecisionSnapshot | null;
  amdState: AmdState | null;
  regimeState: RegimeState | null;
  scalperDayState: ScalperDayState | null;
  asianActiveDetection: AsianSessionDetection | null;
  verificationStatus: {
    liveDirection: string | null;
    reconstructedDirection: string | null;
    match: boolean;
    available: boolean;
  };
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

async function fetchRegimeState(): Promise<RegimeState | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('regime_state')
    .select('*')
    .eq('pair', 'AUD_USD')
    .order('evaluated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RegimeState | null) ?? null;
}

async function fetchScalperBundle(tradeDate: string): Promise<{
  dayState: ScalperDayState | null;
  trades: ScalperTrade[];
}> {
  const supabase = getSupabase();
  const [dayRes, tradesRes] = await Promise.all([
    supabase
      .from('scalper_day_state')
      .select('*')
      .eq('pair', 'AUD_USD')
      .eq('trade_date', tradeDate)
      .maybeSingle(),
    supabase
      .from('scalper_trades')
      .select('*')
      .eq('pair', 'AUD_USD')
      .eq('trade_date', tradeDate)
      .order('opened_at', { ascending: false }),
  ]);
  if (dayRes.error) throw new Error(dayRes.error.message);
  if (tradesRes.error) throw new Error(tradesRes.error.message);
  return {
    dayState: (dayRes.data as ScalperDayState | null) ?? null,
    trades: (tradesRes.data ?? []) as ScalperTrade[],
  };
}

async function fetchEngineActiveMap(): Promise<Record<string, boolean>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('bridge_engines')
    .select('engine_id, is_active');
  if (error) throw new Error(error.message);
  const map: Record<string, boolean> = {};
  for (const row of data ?? []) {
    const engineRow = row as { engine_id: string; is_active: boolean };
    map[engineRow.engine_id] = engineRow.is_active;
  }
  return map;
}

export function useDirectionDecisionData(): UseDirectionDecisionDataResult {
  const [amdState, setAmdState] = useState<AmdState | null>(null);
  const [regimeState, setRegimeState] = useState<RegimeState | null>(null);
  const [scalperDayState, setScalperDayState] = useState<ScalperDayState | null>(null);
  const [detectionRows, setDetectionRows] = useState<AsianSessionDetection[]>([]);
  const [snapshot, setSnapshot] = useState<DirectionDecisionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const tradeDate = new Date().toISOString().slice(0, 10);
      const supabase = getSupabase();
      const [
        amdRow,
        regimeRow,
        asianRows,
        detectionRowsResult,
        omegaWindow,
        controls,
        rebuildHourGateEnabled,
        scalperBundle,
        engineActiveMap,
      ] = await Promise.all([
        fetchAudUsdTodayAmdState(),
        fetchRegimeState(),
        fetchAsianDirectionLog(),
        fetchAsianSessionDetectionLog(7),
        fetchOmegaWindowStatus(),
        fetchEngineControlRows(supabase),
        fetchRebuildHourGateEnabled(supabase),
        fetchScalperBundle(tradeDate),
        fetchEngineActiveMap(),
      ]);

      setAmdState(amdRow);
      setRegimeState(regimeRow);
      setScalperDayState(scalperBundle.dayState);
      setDetectionRows(detectionRowsResult);
      setSnapshot(
        buildDirectionDecisionSnapshot({
          amdState: amdRow,
          regimeState: regimeRow,
          asianRows,
          asianDetectionRows: detectionRowsResult,
          scalperDayState: scalperBundle.dayState,
          scalperTrades: scalperBundle.trades,
          omegaWindow,
          omegaDir: controls.omegaDir,
          pausedIds: controls.pausedIds,
          rebuildHourGateEnabled,
          engineActiveMap,
        }),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadAll();
    const interval = window.setInterval(() => void loadAll(), REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadAll]);

  const refetch = useCallback(() => {
    setLoading(true);
    void loadAll();
  }, [loadAll]);

  return useMemo(() => {
    const verificationStatus = {
      liveDirection: scalperDayState?.direction ?? null,
      reconstructedDirection: amdState?.decision_auto_direction ?? null,
      match:
        scalperDayState?.direction != null &&
        amdState?.decision_auto_direction != null &&
        scalperDayState.direction === amdState.decision_auto_direction,
      available:
        scalperDayState?.direction != null && amdState?.decision_auto_direction != null,
    };

    return {
      snapshot,
      amdState,
      regimeState,
      scalperDayState,
      asianActiveDetection: findTodayActiveDetection(detectionRows),
      verificationStatus,
      loading,
      error,
      refetch,
    };
  }, [snapshot, amdState, regimeState, scalperDayState, detectionRows, loading, error, refetch]);
}
