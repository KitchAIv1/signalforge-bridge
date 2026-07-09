'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import {
  PHASE2_SHADOW_DESKTOP_COLUMN_COUNT,
  Phase2ShadowTradeTableRow,
} from '@/components/omegaPhase2/Phase2ShadowTradeTableRow';

interface Phase2ShadowTradeDesktopTableProps {
  tradeRows: BridgeTradeLogRow[];
  isTradeListLoading: boolean;
  onSelectTrade?: (tradeRow: BridgeTradeLogRow) => void;
}

const DESKTOP_HEADERS = [
  'Time',
  'Dir',
  'Decision',
  'Signal',
  'Founding',
  'Exit / block',
  'Status',
  'PnL',
  'Hold',
  'Session',
] as const;

export function Phase2ShadowTradeDesktopTable({
  tradeRows,
  isTradeListLoading,
  onSelectTrade,
}: Phase2ShadowTradeDesktopTableProps) {
  return (
    <div className="hidden lg:block lg:overflow-x-auto lg:rounded-lg lg:border lg:border-slate-200 lg:bg-white lg:dark:border-slate-700 lg:dark:bg-slate-900">
      <table className="min-w-[1080px] w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300">
            {DESKTOP_HEADERS.map((header) => (
              <th key={header} className="px-3 py-2 text-xs font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <DesktopTableBody
            tradeRows={tradeRows}
            isTradeListLoading={isTradeListLoading}
            onSelectTrade={onSelectTrade}
          />
        </tbody>
      </table>
    </div>
  );
}

function DesktopTableBody({
  tradeRows,
  isTradeListLoading,
  onSelectTrade,
}: Phase2ShadowTradeDesktopTableProps) {
  if (tradeRows.length === 0 && !isTradeListLoading) {
    return (
      <tr>
        <td
          colSpan={PHASE2_SHADOW_DESKTOP_COLUMN_COUNT}
          className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
        >
          No ALPHAOMEGA rows for this filter
        </td>
      </tr>
    );
  }
  return (
    <>
      {tradeRows.map((tradeRow) => (
        <Phase2ShadowTradeTableRow
          key={tradeRow.id}
          tradeRow={tradeRow}
          onSelectTrade={onSelectTrade}
        />
      ))}
    </>
  );
}
