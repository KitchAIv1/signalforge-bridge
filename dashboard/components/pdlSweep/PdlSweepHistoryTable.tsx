'use client';

import type { ReactNode } from 'react';
import type { PdlSweepSignalRow } from '@/lib/pdlSweepTypes';
import { isPdlOutcomeCorrect } from '@/lib/pdlSweepStats';

type HistoryTableProps = {
  firedRows: PdlSweepSignalRow[];
  nonFiredRows: PdlSweepSignalRow[];
};

function formatPips(value: number | null): string {
  return value != null ? `${value}p` : '—';
}

function OutcomeCell({ row }: { row: PdlSweepSignalRow }) {
  if (row.outcome_h12_direction == null) {
    return <span className="text-slate-400">pending</span>;
  }
  return (
    <span>
      {row.outcome_h12_direction} {formatPips(row.outcome_h12_net_pips)}
    </span>
  );
}

function CorrectCell({ row }: { row: PdlSweepSignalRow }) {
  const correct = isPdlOutcomeCorrect(row);
  if (correct == null) return <span className="text-slate-400">—</span>;
  return correct ? (
    <span className="text-green-500">✓</span>
  ) : (
    <span className="text-red-400">✗</span>
  );
}

function SignalHistoryRow({ row }: { row: PdlSweepSignalRow }) {
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{row.trade_date}</td>
      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
        {formatPips(row.pdl_sweep_depth_pips)}
      </td>
      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
        {formatPips(row.london_net_pips)} {row.london_direction ?? ''}
      </td>
      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
        {formatPips(row.h11_net_pips)} {row.h11_direction ?? ''}
      </td>
      <td className="px-3 py-2">
        <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20">
          FIRED
        </span>
      </td>
      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
        <OutcomeCell row={row} />
      </td>
      <td className="px-3 py-2">
        <CorrectCell row={row} />
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {row.amd_outcome_tag ?? 'pending'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {row.decision_auto_direction ?? '—'}
      </td>
    </tr>
  );
}

function NonSignalRow({ row }: { row: PdlSweepSignalRow }) {
  return (
    <tr className="text-slate-500 dark:text-slate-400">
      <td className="px-3 py-2 font-mono">{row.trade_date}</td>
      <td className="px-3 py-2">{formatPips(row.pdl_sweep_depth_pips)}</td>
      <td className="px-3 py-2">
        {formatPips(row.london_net_pips)} {row.london_direction ?? ''}
      </td>
      <td className="px-3 py-2">
        {formatPips(row.h11_net_pips)} {row.h11_direction ?? ''}
      </td>
      <td className="px-3 py-2 text-xs">—</td>
      <td className="px-3 py-2 text-xs">—</td>
      <td className="px-3 py-2 text-xs">—</td>
      <td className="px-3 py-2 text-xs">{row.amd_outcome_tag ?? 'pending'}</td>
      <td className="px-3 py-2 text-xs">{row.decision_auto_direction ?? '—'}</td>
    </tr>
  );
}

function HistoryTableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800">
          <tr>
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">PDL depth</th>
            <th className="px-3 py-2 text-left">London</th>
            <th className="px-3 py-2 text-left">H11</th>
            <th className="px-3 py-2 text-left">Signal</th>
            <th className="px-3 py-2 text-left">Outcome</th>
            <th className="px-3 py-2 text-left">Correct</th>
            <th className="px-3 py-2 text-left">AMD tag</th>
            <th className="px-3 py-2 text-left">Engine</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{children}</tbody>
      </table>
    </div>
  );
}

export function PdlSweepHistoryTable({ firedRows, nonFiredRows }: HistoryTableProps) {
  return (
    <div className="flex flex-col gap-3">
      <HistoryTableShell>
        {firedRows.map((row) => (
          <SignalHistoryRow key={row.id} row={row} />
        ))}
      </HistoryTableShell>

      <p className="text-xs text-slate-400">
        Showing {firedRows.length} fired signal{firedRows.length === 1 ? '' : 's'}
      </p>

      {nonFiredRows.length > 0 ? (
        <details className="rounded-lg border border-slate-200 dark:border-slate-700">
          <summary className="cursor-pointer px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
            Non-signal days ({nonFiredRows.length})
          </summary>
          <div className="border-t border-slate-200 dark:border-slate-700">
            <HistoryTableShell>
              {nonFiredRows.map((row) => (
                <NonSignalRow key={row.id} row={row} />
              ))}
            </HistoryTableShell>
          </div>
        </details>
      ) : null}
    </div>
  );
}
