'use client';

import { useEffect } from 'react';
import { AccountSnapshotDisplay } from '@/components/AccountSnapshotDisplay';
import { OverridePositionCard } from '@/components/override/OverridePositionCard';
import { OverrideSignalLegGroup } from '@/components/override/OverrideSignalLegGroup';
import { useOverrideAccountSnapshot } from '@/hooks/useOverrideAccountSnapshot';
import { useOverrideLaneTrades } from '@/hooks/useOverrideLaneTrades';
import { groupEnrichedTradesBySignal } from '@/lib/overrideTradeLogEnrichment';
import type { EnrichedLiveTrade } from '@/lib/overrideTradeLogEnrichment';
import type { OverrideBrokerId } from '@/lib/overrideBrokerScope';

interface OverrideLanePanelProps {
  brokerId: OverrideBrokerId;
  title: string;
  subtitle?: string;
  groupBySignal: boolean;
  manualCloseNote?: string;
  onTradesChange?: (trades: EnrichedLiveTrade[]) => void;
}

function closeAllLabel(
  tradeCount: number,
  confirmCloseAll: boolean,
  closingAll: boolean,
  title: string,
): string {
  if (closingAll) return `Closing ${title}...`;
  if (confirmCloseAll) return `Tap again to close ALL ${title} positions`;
  return `Close All ${title} (${tradeCount})`;
}

export function OverrideLanePanel({
  brokerId,
  title,
  subtitle,
  groupBySignal,
  manualCloseNote,
  onTradesChange,
}: OverrideLanePanelProps) {
  const { snapshot, isStale, errorMessage: accountError } =
    useOverrideAccountSnapshot(brokerId);
  const lane = useOverrideLaneTrades(brokerId);
  const { grouped, ungrouped } = groupEnrichedTradesBySignal(lane.trades);

  useEffect(() => {
    onTradesChange?.(lane.trades);
  }, [lane.trades, onTradesChange]);

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>
        ) : null}
        {manualCloseNote ? (
          <p className="mt-1 text-[11px] text-amber-500/90">{manualCloseNote}</p>
        ) : null}
      </header>

      <div className="mb-3">
        <AccountSnapshotDisplay
          snapshot={snapshot}
          isStale={isStale}
          emptyLabel={accountError ?? 'Awaiting account data…'}
        />
      </div>

      {lane.loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Loading positions…</p>
      ) : lane.errorMessage ? (
        <p className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-400">
          {lane.errorMessage}
        </p>
      ) : lane.trades.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No open positions</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groupBySignal
            ? grouped.map((group) => (
                <OverrideSignalLegGroup
                  key={group.signalId}
                  group={group}
                  confirmClose={lane.confirmClose}
                  closing={lane.closing}
                  onClose={(tradeId) => {
                    void lane.closeTrade(tradeId);
                  }}
                />
              ))
            : null}
          {(groupBySignal ? ungrouped : lane.trades).map((trade) => (
            <OverridePositionCard
              key={trade.id}
              trade={trade}
              confirmClose={lane.confirmClose}
              closing={lane.closing}
              onClose={(tradeId) => {
                void lane.closeTrade(tradeId);
              }}
            />
          ))}
          {lane.trades.length > 1 ? (
            <button
              type="button"
              onClick={() => {
                void lane.closeAllTrades();
              }}
              disabled={lane.closingAll}
              className={`w-full rounded-xl py-3 text-sm font-semibold transition-colors ${
                lane.confirmCloseAll
                  ? 'bg-red-700 text-white hover:bg-red-600'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              } disabled:opacity-50`}
            >
              {closeAllLabel(
                lane.trades.length,
                lane.confirmCloseAll,
                lane.closingAll,
                title,
              )}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
