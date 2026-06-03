'use client';

import { useEffect, useState } from 'react';
import { fetchAmdTradeEntry, type AmdTradeEntry } from '@/lib/fetchAmdTradeEntry';

export interface UseAmdTradeEntryResult {
  tradeEntry: AmdTradeEntry | null;
  loading: boolean;
}

export function useAmdTradeEntry(tradeDate: string | null): UseAmdTradeEntryResult {
  const [tradeEntry, setTradeEntry] = useState<AmdTradeEntry | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tradeDate) {
      setTradeEntry(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    void fetchAmdTradeEntry(tradeDate)
      .then((entry) => {
        if (!cancelled) setTradeEntry(entry);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tradeDate]);

  return { tradeEntry, loading };
}
