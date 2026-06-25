'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { fetchOmegaWindowStatus, type OmegaWindowStatus } from '@/lib/fetchOmegaWindowStatus';
import type { AsianSessionDetection, D1ContextConfig } from '@/lib/directionDecisionTypes';
import { EMPTY_D1_CONTEXT_CONFIG } from '@/lib/d1ContextHelpers';

export interface UseAsianSessionDetectionResult {
  rows: AsianSessionDetection[];
  todayRow: AsianSessionDetection | null;
  todayChecks: AsianSessionDetection[];
  firedRows: AsianSessionDetection[];
  noFireDays: string[];
  d1Config: D1ContextConfig;
  omegaWindow: OmegaWindowStatus | null;
  loading: boolean;
  error: string | null;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const [detectionRows, d1Context, windowStatus] = await Promise.all([
          fetchAsianSessionDetectionLog(ASIAN_FETCH_LOOKBACK_DAYS),
          fetchD1ContextConfig(),
          fetchOmegaWindowStatus(),
        ]);
        if (!cancelled) {
          setRows(detectionRows);
          setD1Config(d1Context);
          setOmegaWindow(windowStatus);
        }
      } catch (loadError: unknown) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    if (!isActiveAsianPollWindow()) {
      return () => {
        cancelled = true;
      };
    }

    const ticker = setInterval(() => {
      void load();
    }, ASIAN_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(ticker);
    };
  }, []);

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

  return { rows, todayRow, todayChecks, firedRows, noFireDays, d1Config, omegaWindow, loading, error };
}
