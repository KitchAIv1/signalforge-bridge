'use client';

import { useAccountSnapshot } from '@/hooks/useAccountSnapshot';

function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function AccountSnapshotBar() {
  const { snapshot, isStale } = useAccountSnapshot();

  if (snapshot == null) {
    return (
      <p className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-center text-sm text-slate-500">
        Awaiting account data…
      </p>
    );
  }

  const pnl = snapshot.unrealizedPL;
  const pnlPositive = pnl >= 0;
  const pnlPrefix = pnlPositive ? '+' : '';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs text-slate-300 shadow-sm">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2 font-mono tabular-nums">
        <span>
          <span className="text-slate-500">Balance </span>
          <span className="text-slate-100">{formatUsd(snapshot.balance)}</span>
        </span>
        <span>
          <span className="text-slate-500">NAV </span>
          <span className="text-slate-100">{formatUsd(snapshot.equity)}</span>
        </span>
        <span>
          <span className="text-slate-500">Open P&amp;L </span>
          <span className={pnlPositive ? 'text-emerald-400' : 'text-red-400'}>
            {pnlPrefix}
            {formatUsd(pnl)}
          </span>
        </span>
        <span>
          <span className="text-slate-500">Margin Used </span>
          <span className="text-slate-100">{formatUsd(snapshot.marginUsed)}</span>
        </span>
        <span>
          <span className="text-slate-500">Margin Free </span>
          <span className="text-slate-100">{formatUsd(snapshot.marginAvailable)}</span>
        </span>
        <span>
          <span className="text-slate-500">Open Trades </span>
          <span className="text-slate-100">{snapshot.openTradeCount}</span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide">
        <span
          className={`h-2 w-2 rounded-full ${isStale ? 'bg-amber-400' : 'bg-emerald-400'}`}
          aria-hidden
        />
        <span className={isStale ? 'text-amber-400' : 'text-emerald-400'}>
          {isStale ? 'Stale' : 'Live'}
        </span>
      </div>
    </div>
  );
}
