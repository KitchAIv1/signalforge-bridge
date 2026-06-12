'use client';

import {
  deriveDtwDirection,
  formatDirectionLabel,
  formatUtcTime,
} from '@/lib/omegaInverseHelpers';
import type { LiveExecution } from '@/lib/omegaInverseTypes';

type HistoryTableProps = {
  liveExecutions: LiveExecution[];
};

function pnlClass(row: LiveExecution): string {
  if (row.status === 'open') return 'text-slate-500';
  if (row.pnl_r == null) return 'text-slate-500';
  if (row.pnl_r > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (row.pnl_r < 0) return 'text-red-600 dark:text-red-400';
  return 'text-slate-500';
}

function formatPnl(value: number | null): string {
  if (value == null) return '—';
  return value.toFixed(2);
}

export function OmegaInverseHistoryTable({ liveExecutions }: HistoryTableProps) {
  const executedRows = liveExecutions.filter((row) => row.decision === 'EXECUTED');

  if (executedRows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        No live executions yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800">
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">DTW dir</th>
            <th className="px-3 py-2">Exec dir</th>
            <th className="px-3 py-2">Entry</th>
            <th className="px-3 py-2">Exit</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">PnL R</th>
            <th className="px-3 py-2">PnL $</th>
            <th className="px-3 py-2">AMD tag</th>
            <th className="px-3 py-2">Session</th>
          </tr>
        </thead>
        <tbody>
          {executedRows.map((row) => (
            <tr key={row.created_at} className="border-b border-slate-100 dark:border-slate-800">
              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                {formatUtcTime(row.created_at)} {row.created_at.slice(0, 10)}
              </td>
              <td className="px-3 py-2">{formatDirectionLabel(deriveDtwDirection(row.direction))}</td>
              <td className="px-3 py-2">{formatDirectionLabel(row.direction)}</td>
              <td className="px-3 py-2">{row.fill_price ?? row.entry_price ?? '—'}</td>
              <td className="px-3 py-2">{row.exit_price ?? '—'}</td>
              <td className={`px-3 py-2 capitalize ${pnlClass(row)}`}>{row.status}</td>
              <td className={`px-3 py-2 ${pnlClass(row)}`}>{formatPnl(row.pnl_r)}</td>
              <td className={`px-3 py-2 ${pnlClass(row)}`}>{formatPnl(row.pnl_dollars)}</td>
              <td className="px-3 py-2">{row.amd_tag ?? '—'}</td>
              <td className="px-3 py-2">{row.signal_session ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
