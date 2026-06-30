'use client';

import { useCallback, useEffect, useState } from 'react';
import { AUDUSD_FADE_REFRESH_MS } from '@/lib/audusdFadeConstants';
import { computeAudusdFadeStats, isFadeTradeOpen } from '@/lib/audusdFadeStats';
import type { AudusdFadeStats, AudusdFadeTradeRow } from '@/lib/audusdFadeTypes';
import { fetchAudusdFadeTrades } from '@/lib/fetchAudusdFadeTrades';

export interface UseAudusdFadeTradesResult {
  rows: AudusdFadeTradeRow[];
  closedRows: AudusdFadeTradeRow[];
  openRows: AudusdFadeTradeRow[];
  todayRows: AudusdFadeTradeRow[];
  stats: AudusdFadeStats;
  loading: boolean;
  error: string | null;
}

export function useAudusdFadeTrades(): UseAudusdFadeTradesResult {
  const [rows, setRows] = useState<AudusdFadeTradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    try {
      const nextRows = await fetchAudusdFadeTrades();
      setRows(nextRows);
      setError(null);
    } catch (loadErr: unknown) {
      setError(loadErr instanceof Error ? loadErr.message : String(loadErr));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
    const ticker = setInterval(() => {
      void loadRows();
    }, AUDUSD_FADE_REFRESH_MS);
    return () => clearInterval(ticker);
  }, [loadRows]);

  const todayUtc = new Date().toISOString().slice(0, 10);
  const closedRows = rows.filter((row) => !isFadeTradeOpen(row));
  const openRows = rows.filter(isFadeTradeOpen);
  const todayRows = rows.filter((row) => row.trade_date === todayUtc);
  const stats = computeAudusdFadeStats(rows, todayUtc);

  return { rows, closedRows, openRows, todayRows, stats, loading, error };
}
