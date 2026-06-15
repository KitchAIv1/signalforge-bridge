'use client';

import { useEffect, useState, useCallback } from 'react';

interface LiveTrade {
  id: string;
  instrument: string;
  units: string;
  openTime: string;
  unrealizedPL: string;
  price: string;
  stopLossPrice: string | null;
  takeProfitPrice: string | null;
}

function getDirection(units: string): 'LONG' | 'SHORT' {
  return parseFloat(units) > 0 ? 'LONG' : 'SHORT';
}

function getDurationMinutes(openTime: string): number {
  return Math.floor((Date.now() - new Date(openTime).getTime()) / 60000);
}

function getUnrealizedPips(trade: LiveTrade): number {
  const pl = parseFloat(trade.unrealizedPL);
  const units = Math.abs(parseFloat(trade.units));
  if (units === 0) return 0;
  return parseFloat((pl / units / 0.0001).toFixed(1));
}

export function OverrideTerminal() {
  const [trades, setTrades] = useState<LiveTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [closingAll, setClosingAll] = useState(false);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch('/api/override/positions');
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json() as { trades: LiveTrade[] };
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
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        Loading positions...
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
      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
        No open positions
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {trades.map(trade => {
        const direction = getDirection(trade.units);
        const pips = getUnrealizedPips(trade);
        const pl = parseFloat(trade.unrealizedPL);
        const duration = getDurationMinutes(trade.openTime);
        const isProfit = pl > 0;
        const isHighlight = Math.abs(pips) >= 6 && isProfit;

        return (
          <div
            key={trade.id}
            className={`rounded-xl border p-4 ${
              isHighlight
                ? 'border-amber-500 bg-amber-950/30'
                : isProfit
                ? 'border-emerald-800 bg-emerald-950/20'
                : 'border-red-800 bg-red-950/20'
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-slate-100">
                  {trade.instrument}
                </span>
                <span className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${
                  direction === 'LONG'
                    ? 'bg-emerald-900 text-emerald-300'
                    : 'bg-red-900 text-red-300'
                }`}>
                  {direction}
                </span>
                {isHighlight && (
                  <span className="ml-2 rounded bg-amber-800 px-1.5 py-0.5 text-xs font-medium text-amber-200">
                    ⚡ {pips}p
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-500">{duration}m</span>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500">Entry</span>
                <div className="font-mono text-slate-200">{trade.price}</div>
              </div>
              <div>
                <span className="text-slate-500">Unrealized P&L</span>
                <div className={`font-mono font-semibold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isProfit ? '+' : ''}{pips}p / ${pl.toFixed(2)}
                </div>
              </div>
              {trade.stopLossPrice && (
                <div>
                  <span className="text-slate-500">SL</span>
                  <div className="font-mono text-red-300">{trade.stopLossPrice}</div>
                </div>
              )}
              {trade.takeProfitPrice && (
                <div>
                  <span className="text-slate-500">TP</span>
                  <div className="font-mono text-emerald-300">{trade.takeProfitPrice}</div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => { void handleClose(trade.id); }}
              disabled={closing === trade.id}
              className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
                confirmClose === trade.id
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              } disabled:opacity-50`}
            >
              {closing === trade.id
                ? 'Closing...'
                : confirmClose === trade.id
                ? 'Tap again to confirm close'
                : 'Close Trade'}
            </button>
          </div>
        );
      })}

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
            : `Close All (${trades.length})`}
        </button>
      )}
    </div>
  );
}
