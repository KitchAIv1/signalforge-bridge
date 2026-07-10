'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EnrichedLiveTrade } from '@/lib/overrideTradeLogEnrichment';
import type { OverrideBrokerId } from '@/lib/overrideBrokerScope';
import { parseOverrideApiError } from '@/lib/parseOverrideApiError';

const POLL_MS = 5_000;

export function useOverrideLaneTrades(brokerId: OverrideBrokerId) {
  const [trades, setTrades] = useState<EnrichedLiveTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [closingAll, setClosingAll] = useState(false);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/override/positions?brokerId=${encodeURIComponent(brokerId)}`,
      );
      if (!res.ok) {
        throw new Error(await parseOverrideApiError(res, 'Positions fetch'));
      }
      const data = (await res.json()) as { trades: EnrichedLiveTrade[] };
      setTrades(data.trades);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setLoading(false);
    }
  }, [brokerId]);

  useEffect(() => {
    void fetchTrades();
    const interval = window.setInterval(() => void fetchTrades(), POLL_MS);
    return () => window.clearInterval(interval);
  }, [fetchTrades]);

  const closeTrade = useCallback(
    async (tradeId: string) => {
      if (confirmClose !== tradeId) {
        setConfirmClose(tradeId);
        window.setTimeout(() => setConfirmClose(null), 3000);
        return;
      }
      setClosing(tradeId);
      setConfirmClose(null);
      try {
        await fetch('/api/override/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tradeId, brokerId }),
        });
        await fetchTrades();
      } finally {
        setClosing(null);
      }
    },
    [brokerId, confirmClose, fetchTrades],
  );

  const closeAllTrades = useCallback(async () => {
    if (!confirmCloseAll) {
      setConfirmCloseAll(true);
      window.setTimeout(() => setConfirmCloseAll(false), 3000);
      return;
    }
    setClosingAll(true);
    setConfirmCloseAll(false);
    try {
      await fetch('/api/override/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closeAll: true, brokerId }),
      });
      await fetchTrades();
    } finally {
      setClosingAll(false);
    }
  }, [brokerId, confirmCloseAll, fetchTrades]);

  return {
    trades,
    loading,
    errorMessage,
    confirmClose,
    confirmCloseAll,
    closing,
    closingAll,
    closeTrade,
    closeAllTrades,
  };
}
