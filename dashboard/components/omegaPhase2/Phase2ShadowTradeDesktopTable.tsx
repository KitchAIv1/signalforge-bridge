'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import {
  PHASE2_SHADOW_DESKTOP_COLUMN_COUNT,
  Phase2ShadowTradeTableRow,
} from '@/components/omegaPhase2/Phase2ShadowTradeTableRow';

interface Phase2ShadowTradeDesktopTableProps {
  tradeRows: BridgeTradeLogRow[];
  isTradeListLoading: boolean;
}

export function Phase2ShadowTradeDesktopTable({
  tradeRows,
  isTradeListLoading,
}: Phase2ShadowTradeDesktopTableProps) {
  return (
    <div className="hidden lg:block lg:overflow-x-auto lg:rounded-lg lg:border lg:border-slate-200 lg:bg-white lg:dark:border-slate-700 lg:dark:bg-slate-900">
      <table className="min-w-[1100px] w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300">
            <th className="px-3 py-2 text-xs font-medium">Time</th>
            <th className="px-3 py-2 text-xs font-medium">Dir</th>
            <th className="px-3 py-2 text-xs font-medium">Decision</th>
            <th className="px-3 py-2 text-xs font-medium">Gate signal</th>
            <th className="px-3 py-2 text-xs font-medium">Block reason</th>
            <th className="px-3 py-2 text-xs font-medium">Session</th>
            <th className="px-3 py-2 text-xs font-medium">Status</th>
            <th className="px-3 py-2 text-xs font-medium">R</th>
            <th className="px-3 py-2 text-xs font-medium">Close</th>
            <th className="px-3 py-2 text-xs font-medium">AMD</th>
            <th className="px-3 py-2 text-xs font-medium">Raw advisory</th>
          </tr>
        </thead>
        <tbody>
          {tradeRows.length === 0 && !isTradeListLoading ? (
            <tr>
              <td
                colSpan={PHASE2_SHADOW_DESKTOP_COLUMN_COUNT}
                className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
              >
                No Lane B rows for this filter
              </td>
            </tr>
          ) : (
            tradeRows.map((tradeRow) => (
              <Phase2ShadowTradeTableRow key={tradeRow.id} tradeRow={tradeRow} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
