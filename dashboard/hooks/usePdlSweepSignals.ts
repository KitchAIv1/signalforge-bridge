'use client';

import { useEffect, useState } from 'react';
import type { PdlSweepSignalRow } from '@/lib/pdlSweepTypes';
import { fetchPdlSweepSignals } from '@/lib/fetchPdlSweepSignals';
import {
  PDL_POLL_END_HOUR_UTC,
  PDL_POLL_END_MINUTE_UTC,
  PDL_POLL_START_HOUR_UTC,
  PDL_POLL_START_MINUTE_UTC,
  PDL_SWEEP_REFRESH_MS,
} from '@/lib/pdlSweepConstants';

export interface UsePdlSweepSignalsResult {
  rows: PdlSweepSignalRow[];
  todayRow: PdlSweepSignalRow | null;
  firedRows: PdlSweepSignalRow[];
  nonFiredRows: PdlSweepSignalRow[];
  loading: boolean;
  error: string | null;
}

function isActivePollWindow(): boolean {
  const now = new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const startMins = PDL_POLL_START_HOUR_UTC * 60 + PDL_POLL_START_MINUTE_UTC;
  const endMins = PDL_POLL_END_HOUR_UTC * 60 + PDL_POLL_END_MINUTE_UTC;
  const nowMins = hour * 60 + minute;
  return nowMins >= startMins && nowMins <= endMins;
}

export function usePdlSweepSignals(): UsePdlSweepSignalsResult {
  const [rows, setRows] = useState<PdlSweepSignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPdlSweepSignals();
        if (!cancelled) setRows(data);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    if (!isActivePollWindow()) {
      return () => {
        cancelled = true;
      };
    }

    const ticker = setInterval(() => {
      void load();
    }, PDL_SWEEP_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(ticker);
    };
  }, []);

  const todayUtc = new Date().toISOString().slice(0, 10);
  const todayRow = rows.find((row) => row.trade_date === todayUtc) ?? null;
  const firedRows = rows.filter((row) => row.signal_fired);
  const nonFiredRows = rows.filter((row) => !row.signal_fired);

  return { rows, todayRow, firedRows, nonFiredRows, loading, error };
}
