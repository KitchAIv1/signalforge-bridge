'use client';

import { AudusdFadeDirectionPill } from '@/components/audusdFade/AudusdFadeDirectionPill';
import { AudusdFadeResultPill } from '@/components/audusdFade/AudusdFadeResultPill';
import {
  computeTradeDurationMinutes,
  effectivePnlPips,
  isFadeTradeSuccessful,
} from '@/lib/audusdFadeStats';
import type { AudusdFadeTradeRow } from '@/lib/audusdFadeTypes';

type HistoryTableProps = {
  closedRows: AudusdFadeTradeRow[];
};

function formatPrice(value: number | null | undefined): string {
  return value != null ? value.toFixed(5) : '—';
}

function formatPips(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}p`;
}

function pnlClass(pnl: number | null): string {
  if (pnl == null) return 'text-slate-500';
  if (pnl > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (pnl < 0) return 'text-red-600 dark:text-red-400';
  return 'text-slate-500';
}

function SuccessCell({ row }: { row: AudusdFadeTradeRow }) {
  const successful = isFadeTradeSuccessful(row);
  if (successful == null) return <span className="text-slate-400">—</span>;
  return successful ? (
    <span className="text-green-500">✓</span>
  ) : (
    <span className="text-red-400">✗</span>
  );
}

function HistoryRow({ row }: { row: AudusdFadeTradeRow }) {
  const pnl = effectivePnlPips(row);
  const duration = computeTradeDurationMinutes(row);

  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{row.trade_date}</td>
      <td className="px-3 py-2">
        <AudusdFadeDirectionPill direction={row.direction} />
      </td>
      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
        {formatPrice(row.entry_price)}
      </td>
      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
        {formatPrice(row.tp_price)}
      </td>
      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
        {formatPrice(row.sl_price)}
      </td>
      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
        {formatPrice(row.exit_price)}
      </td>
      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{formatPips(row.ext_pips)}</td>
      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{formatPips(row.aligned_eur)}</td>
      <td className="px-3 py-2">
        <AudusdFadeResultPill result={row.result} successful={isFadeTradeSuccessful(row)} />
      </td>
      <td className={`px-3 py-2 ${pnlClass(pnl)}`}>{formatPips(pnl)}</td>
      <td className="px-3 py-2">
        <SuccessCell row={row} />
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {duration != null ? `${duration}m` : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {row.close_reason ?? '—'}
      </td>
    </tr>
  );
}

export function AudusdFadeHistoryTable({ closedRows }: HistoryTableProps) {
  if (closedRows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        No closed fade trades yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Direction</th>
              <th className="px-3 py-2 text-left">Entry</th>
              <th className="px-3 py-2 text-left">TP</th>
              <th className="px-3 py-2 text-left">SL</th>
              <th className="px-3 py-2 text-left">Exit</th>
              <th className="px-3 py-2 text-left">Extension</th>
              <th className="px-3 py-2 text-left">EUR aligned</th>
              <th className="px-3 py-2 text-left">Result</th>
              <th className="px-3 py-2 text-left">PnL</th>
              <th className="px-3 py-2 text-left">OK</th>
              <th className="px-3 py-2 text-left">Duration</th>
              <th className="px-3 py-2 text-left">Close reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {closedRows.map((row) => (
              <HistoryRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Showing {closedRows.length} closed trade{closedRows.length === 1 ? '' : 's'}
      </p>
    </div>
  );
}
