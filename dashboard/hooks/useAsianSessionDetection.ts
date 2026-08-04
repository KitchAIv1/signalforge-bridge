'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePollingInterval } from '@/hooks/usePollingInterval';
import { CRON_SCHEDULE } from '@/lib/asianDetectionDisplayHelpers';
import {
  ASIAN_FETCH_LOOKBACK_DAYS,
  ASIAN_POLL_END_HOUR_UTC,
  ASIAN_POLL_END_MINUTE_UTC,
  ASIAN_POLL_START_HOUR_UTC,
  ASIAN_POLL_START_MINUTE_UTC,
  ASIAN_REFRESH_MS,
} from '@/lib/asianSessionConstants';
import { deriveNoFireTradeDates, isAsianFireAction } from '@/lib/asianSessionPageHelpers';
import { fetchAsianSessionDetectionLog, fetchD1ContextConfig } from '@/lib/fetchAsianDirectionLog';
import { fetchAsianSessionAmdMetricsByDates } from '@/lib/fetchAsianSessionAmdMetrics';
import {
  buildAsianSessionAmdMetricsMap,
  type AsianSessionAmdMetricsSlice,
} from '@/lib/asianSessionAmdMetricsTypes';
import { fetchOmegaWindowStatus, type OmegaWindowStatus } from '@/lib/fetchOmegaWindowStatus';
import type { AsianSessionDetection, D1ContextConfig } from '@/lib/directionDecisionTypes';
import { EMPTY_D1_CONTEXT_CONFIG } from '@/lib/d1ContextHelpers';

export interface UseAsianSessionDetectionResult {
  rows: AsianSessionDetection[];
  todayRow: AsianSessionDetection | null;
  todayChecks: AsianSessionDetection[];
  firedRows: AsianSessionDetection[];
  noFireDays: string[];
  amdMetricsByDate: ReadonlyMap<string, AsianSessionAmdMetricsSlice>;
  d1Config: D1ContextConfig;
  omegaWindow: OmegaWindowStatus | null;
  loading: boolean;
  error: string | null;
}

function distinctTradeDates(rows: readonly AsianSessionDetection[]): string[] {
  return [...new Set(rows.map((row) => row.trade_date))];
}

function isActiveAsianPollWindow(): boolean {
  const now = new Date();
  const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const startMins = ASIAN_POLL_START_HOUR_UTC * 60 + ASIAN_POLL_START_MINUTE_UTC;
  const endMins = ASIAN_POLL_END_HOUR_UTC * 60 + ASIAN_POLL_END_MINUTE_UTC;
  return nowMins >= startMins && nowMins <= endMins;
}

function sortTodayChecks(rows: AsianSessionDetection[]): AsianSessionDetection[] {
  const cronOrder: string[] = CRON_SCHEDULE.map((cron) => cron.time);
  return [...rows].sort(
    (left, right) => cronOrder.indexOf(left.condition_check_time) - cronOrder.indexOf(right.condition_check_time),
  );
}

export function useAsianSessionDetection(): UseAsianSessionDetectionResult {
  const [rows, setRows] = useState<AsianSessionDetection[]>([]);
  const [d1Config, setD1Config] = useState<D1ContextConfig>({
    ...EMPTY_D1_CONTEXT_CONFIG,
    asian_prior_amd_tag: null,
    asian_prior_amd_shifted: null,
    asian_prior_direction_bias: null,
  });
  const [omegaWindow, setOmegaWindow] = useState<OmegaWindowStatus | null>(null);
  const [amdMetricsByDate, setAmdMetricsByDate] = useState<
    ReadonlyMap<string, AsianSessionAmdMetricsSlice>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const detectionRows = await fetchAsianSessionDetectionLog(ASIAN_FETCH_LOOKBACK_DAYS);
      const tradeDates = distinctTradeDates(detectionRows);
      let amdMetricRows: AsianSessionAmdMetricsSlice[] = [];
      try {
        amdMetricRows = await fetchAsianSessionAmdMetricsByDates(tradeDates);
      } catch {
        amdMetricRows = [];
      }
      const [d1Context, windowStatus] = await Promise.all([
        fetchD1ContextConfig(),
        fetchOmegaWindowStatus(),
      ]);
      setRows(detectionRows);
      setAmdMetricsByDate(buildAsianSessionAmdMetricsMap(amdMetricRows));
      setD1Config(d1Context);
      setOmegaWindow(windowStatus);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Ticks only fetch during the Asian poll window; initial load always runs above.
  usePollingInterval(() => {
    if (isActiveAsianPollWindow()) void load();
  }, ASIAN_REFRESH_MS, { runImmediately: false });

  const todayUtc = new Date().toISOString().slice(0, 10);
  const todayChecks = useMemo(
    () => sortTodayChecks(rows.filter((row) => row.trade_date === todayUtc)),
    [rows, todayUtc],
  );
  const todayRow = useMemo(
    () => todayChecks.find((row) => isAsianFireAction(row.action)) ?? null,
    [todayChecks],
  );
  const firedRows = useMemo(
    () => rows.filter((row) => isAsianFireAction(row.action)),
    [rows],
  );
  const noFireDays = useMemo(() => deriveNoFireTradeDates(rows), [rows]);

  return {
    rows,
    todayRow,
    todayChecks,
    firedRows,
    noFireDays,
    amdMetricsByDate,
    d1Config,
    omegaWindow,
    loading,
    error,
  };
}
