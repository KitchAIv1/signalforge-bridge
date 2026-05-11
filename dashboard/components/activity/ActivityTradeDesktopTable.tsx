'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import { ActivityTradeTableRow } from '@/components/activity/ActivityTradeTableRow';

export const ACTIVITY_DESKTOP_COLUMN_COUNT = 19;

interface ActivityTradeDesktopTableProps {
  rows: BridgeTradeLogRow[];
  isTradeListLoading: boolean;
}

export function ActivityTradeDesktopTable({ rows, isTradeListLoading }: ActivityTradeDesktopTableProps) {
  return (
    <div className="hidden lg:block lg:overflow-x-auto lg:rounded-lg lg:border lg:border-slate-200 lg:bg-white">
      <table className="min-w-[1600px] w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <th className="px-3 py-2 text-xs font-medium">Time</th>
            <th className="px-3 py-2 text-xs font-medium">Engine</th>
            <th className="px-3 py-2 text-xs font-medium">Pair</th>
            <th className="px-3 py-2 text-xs font-medium">Dir</th>
            <th className="px-3 py-2 text-xs font-medium">Score</th>
            <th className="px-3 py-2 text-xs font-medium">Decision</th>
            <th className="px-3 py-2 text-xs font-medium">Reason</th>
            <th className="px-3 py-2 text-xs font-medium">Fill</th>
            <th className="px-3 py-2 text-xs font-medium">SL</th>
            <th className="px-3 py-2 text-xs font-medium">TP</th>
            <th className="px-3 py-2 text-xs font-medium">Exit</th>
            <th className="px-3 py-2 text-xs font-medium">Lots</th>
            <th className="px-3 py-2 text-xs font-medium">P&L $</th>
            <th className="px-3 py-2 text-xs font-medium">Pips</th>
            <th className="px-3 py-2 text-xs font-medium">R</th>
            <th className="px-3 py-2 text-xs font-medium">Duration</th>
            <th className="px-3 py-2 text-xs font-medium">Result</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Regime
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Confidence
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !isTradeListLoading ? (
            <tr>
              <td colSpan={ACTIVITY_DESKTOP_COLUMN_COUNT} className="px-4 py-8 text-center text-slate-500">
                No activity
              </td>
            </tr>
          ) : (
            rows.map((tradeRow) => <ActivityTradeTableRow key={tradeRow.id} row={tradeRow} />)
          )}
        </tbody>
      </table>
    </div>
  );
}
