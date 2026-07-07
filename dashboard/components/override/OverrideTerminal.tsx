'use client';

import { useEffect, useState, useCallback } from 'react';
import { AccountSnapshotBar } from '@/components/AccountSnapshotBar';
import { OverrideChart } from '@/components/override/OverrideChart';
import { OverridePositionCard } from '@/components/override/OverridePositionCard';
import { OverrideSignalLegGroup } from '@/components/override/OverrideSignalLegGroup';
import type { EnrichedLiveTrade } from '@/lib/overrideTradeLogEnrichment';
import { groupEnrichedTradesBySignal } from '@/lib/overrideTradeLogEnrichment';
import { parseOverrideApiError } from '@/lib/parseOverrideApiError';

function buildTradeLines(trades: EnrichedLiveTrade[]): Array<{ price: number; label: string; color: string }> {
  const lines: Array<{ price: number; label: string; color: string }> = [];
  trades.forEach((trade) => {
    const dir = parseFloat(trade.units) > 0 ? 'L' : 'S';
    if (trade.price) {
      lines.push({ price: parseFloat(trade.price), label: `Entry ${dir}`, color: '#94a3b8' });
    }
    if (trade.stopLossPrice) {
      lines.push({ price: parseFloat(trade.stopLossPrice), label: 'SL', color: '#ef4444' });
    }
    if (trade.takeProfitPrice) {
      lines.push({ price: parseFloat(trade.takeProfitPrice), label: 'TP', color: '#10b981' });
    }
  });
  return lines;
}

export function OverrideTerminal() {
  const [trades, setTrades] = useState<EnrichedLiveTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [closingAll, setClosingAll] = useState(false);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/override/positions');
      if (!res.ok) throw new Error(await parseOverrideApiError(res, 'Positions fetch'));
      const data = await res.json() as { trades: EnrichedLiveTrade[] };
      setTrades(data.trades);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTrades();
    const interval = setInterval(() => { void fetchTrades(); }, 5000);
    return () => clearInterval(interval);
  }, [fetchTrades]);

  async function handleClose(tradeId: string) {
    if (confirmClose !== tradeId) {
      setConfirmClose(tradeId);
      setTimeout(() => setConfirmClose(null), 3000);
      return;
    }
    setClosing(tradeId);
    setConfirmClose(null);
    try {
      await fetch('/api/override/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeId }),
      });
      await fetchTrades();
    } finally {
      setClosing(null);
    }
  }

  async function handleCloseAll() {
    if (!confirmCloseAll) {
      setConfirmCloseAll(true);
      setTimeout(() => setConfirmCloseAll(false), 3000);
      return;
    }
    setClosingAll(true);
    setConfirmCloseAll(false);
    try {
      await fetch('/api/override/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closeAll: true }),
      });
      await fetchTrades();
    } finally {
      setClosingAll(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <OverrideChart tradeLines={[]} />
        <AccountSnapshotBar />
        <div className="flex h-40 items-center justify-center text-sm text-slate-400">
          Loading positions...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950 p-4 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <OverrideChart tradeLines={[]} />
        <AccountSnapshotBar />
        <div className="flex h-40 items-center justify-center text-sm text-slate-400">
          No open positions
        </div>
      </div>
    );
  }

  const { grouped, ungrouped } = groupEnrichedTradesBySignal(trades);
  const omegaLegCount = grouped.reduce((sum, group) => sum + group.trades.length, 0);
  const otherCount = ungrouped.length;

  return (
    <div className="flex flex-col gap-3">
      <OverrideChart tradeLines={buildTradeLines(trades)} />
      <AccountSnapshotBar />

      {grouped.map((group) => (
        <OverrideSignalLegGroup
          key={group.signalId}
          group={group}
          confirmClose={confirmClose}
          closing={closing}
          onClose={handleClose}
        />
      ))}

      {ungrouped.map((trade) => (
        <OverridePositionCard
          key={trade.id}
          trade={trade}
          confirmClose={confirmClose}
          closing={closing}
          onClose={handleClose}
        />
      ))}

      {trades.length > 1 && (
        <button
          type="button"
          onClick={() => { void handleCloseAll(); }}
          disabled={closingAll}
          className={`w-full rounded-xl py-3 text-sm font-semibold transition-colors ${
            confirmCloseAll
              ? 'bg-red-700 text-white hover:bg-red-600'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          } disabled:opacity-50`}
        >
          {closingAll
            ? 'Closing all...'
            : confirmCloseAll
              ? 'Tap again to close ALL positions'
              : omegaLegCount > 0 && otherCount > 0
                ? `Close All (${omegaLegCount} Omega legs + ${otherCount} others)`
                : omegaLegCount > 0
                  ? `Close All (${omegaLegCount} Omega legs)`
                  : `Close All (${trades.length})`}
        </button>
      )}
    </div>
  );
}
