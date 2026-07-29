'use client';

import type { ReactNode } from 'react';
import type { ConditionsMet, PdlSweepSignalRow } from '@/lib/pdlSweepTypes';
import { pdlLiveSideFromConditions } from '@/lib/pdlWindowDirection';
import { PdlLiveTradeCells } from '@/components/pdlSweep/PdlLiveTradeCells';

type HistoryTableProps = {
  rows: PdlSweepSignalRow[];
};

function formatPips(value: number | null): string {
  return value != null ? `${value}p` : '—';
}

function ResearchOutcome({ row }: { row: PdlSweepSignalRow }) {
  if (row.outcome_h12_direction == null) {
    return <span className="text-amber-400">Pending</span>;
  }
  return (
    <span>
      {row.outcome_h12_direction} {formatPips(row.outcome_h12_net_pips)}
    </span>
  );
}

function ConditionsCell({ row }: { row: PdlSweepSignalRow }) {
  const conditions = row.conditions_met as ConditionsMet | null;
  if (!conditions) return <span className="text-slate-500">—</span>;
  const side = pdlLiveSideFromConditions(conditions);
  return (
    <div className="space-y-0.5 text-xs">
      <span className="font-semibold text-slate-700 dark:text-slate-300">
        {side.toUpperCase()}
      </span>
      <span className="block text-slate-500">
        PDL{conditions.pdl_breach ? '✓' : '✗'} · LDN
        {conditions.london_down ? '✓' : '✗'} · H11
        {conditions.h11_up ? '✓' : '✗'}
      </span>
    </div>
  );
}

function HistoryRow({ row }: { row: PdlSweepSignalRow }) {
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
        {row.trade_date}
      </td>
      <td className="px-3 py-2">
        <ConditionsCell row={row} />
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {formatPips(row.pdl_sweep_depth_pips)}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {formatPips(row.london_net_pips)} {row.london_direction ?? ''}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        {formatPips(row.h11_net_pips)} {row.h11_direction ?? ''}
      </td>
      <PdlLiveTradeCells signalRow={row} />
      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
        <ResearchOutcome row={row} />
      </td>
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
            <th className="px-3 py-2 text-left">Live side</th>
            <th className="px-3 py-2 text-left">PDL depth</th>
            <th className="px-3 py-2 text-left">London</th>
            <th className="px-3 py-2 text-left">H11</th>
            <th className="px-3 py-2 text-left">Book side</th>
            <th className="px-3 py-2 text-left">Entry</th>
            <th className="px-3 py-2 text-left">Exit</th>
            <th className="px-3 py-2 text-left">PnL (net)</th>
            <th className="px-3 py-2 text-left">Book</th>
            <th className="px-3 py-2 text-left">H12 raw</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function PdlSweepHistoryTable({ rows }: HistoryTableProps) {
  return (
    <div className="flex flex-col gap-3">
      <HistoryTableShell>
        {rows.map((row) => (
          <HistoryRow key={row.id} row={row} />
        ))}
      </HistoryTableShell>
      <p className="text-xs text-slate-400">
        Showing {rows.length} trading day{rows.length === 1 ? '' : 's'}. Book columns
        use the current rule (12:00–13:00, side from conditions, PnL = signed H12 −
        1.5p). Legacy broker fills that flattened at 15:00 are intentionally hidden
        here — see Activity for raw broker history.
      </p>
    </div>
  );
}
