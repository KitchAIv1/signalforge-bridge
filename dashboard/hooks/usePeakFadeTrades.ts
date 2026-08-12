'use client';

import { useCallback, useState } from 'react';
import { usePollingInterval } from '@/hooks/usePollingInterval';
import { fetchPeakFadeTrades } from '@/lib/fetchPeakFadeTrades';
import { computePeakFadeStats, isPeakFadeOpen } from '@/lib/peakFadeStats';
import type { PeakFadeStats, PeakFadeTradeRow } from '@/lib/peakFadeTypes';

const REFRESH_MS = 30_000;

export function usePeakFadeTrades(): {
  closedRows: PeakFadeTradeRow[];
  openRows: PeakFadeTradeRow[];
  todayRows: PeakFadeTradeRow[];
  stats: PeakFadeStats;
  loading: boolean;
  error: string | null;
} {
  const [rows, setRows] = useState<PeakFadeTradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    try {
      setRows(await fetchPeakFadeTrades());
      setError(null);
    } catch (loadErr: unknown) {
      setError(loadErr instanceof Error ? loadErr.message : String(loadErr));
    } finally {
      setLoading(false);
    }
  }, []);

  usePollingInterval(() => void loadRows(), REFRESH_MS);

  const todayUtc = new Date().toISOString().slice(0, 10);
  const closedRows = rows.filter((row) => !isPeakFadeOpen(row));
  const openRows = rows.filter(isPeakFadeOpen);
  const todayRows = rows.filter((row) => row.trade_date === todayUtc);
  return {
    closedRows,
    openRows,
    todayRows,
    stats: computePeakFadeStats(rows, todayUtc),
    loading,
    error,
  };
}
