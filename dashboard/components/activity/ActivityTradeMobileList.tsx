'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import { ActivityTradeMobileCard } from '@/components/activity/ActivityTradeMobileCard';

interface ActivityTradeMobileListProps {
  rows: BridgeTradeLogRow[];
  isTradeListLoading: boolean;
}

export function ActivityTradeMobileList({ rows, isTradeListLoading }: ActivityTradeMobileListProps) {
  if (rows.length === 0 && !isTradeListLoading) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 lg:hidden">
        No activity
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:hidden">
      {rows.map((tradeRow) => (
        <ActivityTradeMobileCard key={tradeRow.id} row={tradeRow} />
      ))}
    </div>
  );
}
