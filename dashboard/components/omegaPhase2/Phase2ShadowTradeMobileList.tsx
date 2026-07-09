'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import { Phase2ShadowTradeMobileCard } from '@/components/omegaPhase2/Phase2ShadowTradeMobileCard';

interface Phase2ShadowTradeMobileListProps {
  tradeRows: BridgeTradeLogRow[];
  isTradeListLoading: boolean;
  onSelectTrade?: (tradeRow: BridgeTradeLogRow) => void;
}

export function Phase2ShadowTradeMobileList({
  tradeRows,
  isTradeListLoading,
  onSelectTrade,
}: Phase2ShadowTradeMobileListProps) {
  if (tradeRows.length === 0 && !isTradeListLoading) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 lg:hidden">
        No ALPHAOMEGA rows for this filter
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:hidden">
      {tradeRows.map((tradeRow) => (
        <Phase2ShadowTradeMobileCard
          key={tradeRow.id}
          tradeRow={tradeRow}
          onSelectTrade={onSelectTrade}
        />
      ))}
    </div>
  );
}
