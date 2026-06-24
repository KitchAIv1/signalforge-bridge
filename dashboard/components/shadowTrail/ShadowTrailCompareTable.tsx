'use client';

import type { ShadowTrailRow } from '@/lib/shadowTrailTypes';

interface ShadowTrailCompareTableProps {
  rows: ShadowTrailRow[];
}

function formatPips(value: number | null): string {
  if (value == null) return '—';
  return `${value.toFixed(1)}p`;
}

function formatSeqCell(status: string | null, pips: number | null): string {
  if (status === 'executed') return formatPips(pips);
  return status ?? '—';
}

function formatOptSl(row: ShadowTrailRow): string {
  if (row.shadow_opt_sl_r == null) return '—';
  return `${row.shadow_opt_sl_r.toFixed(1)}R`;
}

export function ShadowTrailCompareTable({ rows }: ShadowTrailCompareTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
          <tr>
            <th className="px-3 py-2" colSpan={4} />
            <th className="border-l border-slate-200 px-3 py-2 text-center dark:border-slate-700" colSpan={2}>
              Baseline 1.5R
            </th>
            <th className="border-l border-slate-200 px-3 py-2 text-center dark:border-slate-700" colSpan={3}>
              Optimized S2 / L3
            </th>
            <th className="border-l border-slate-200 px-3 py-2 dark:border-slate-700">Live</th>
          </tr>
          <tr className="border-t border-slate-200 dark:border-slate-700">
            <th className="px-3 py-2">Time (UTC)</th>
            <th className="px-3 py-2">Dir</th>
            <th className="px-3 py-2">Window</th>
            <th className="px-3 py-2">Filter</th>
            <th className="border-l border-slate-200 px-3 py-2 dark:border-slate-700">Ungated</th>
            <th className="px-3 py-2">Seq</th>
            <th className="border-l border-slate-200 px-3 py-2 dark:border-slate-700">SL</th>
            <th className="px-3 py-2">Ungated</th>
            <th className="px-3 py-2">Seq</th>
            <th className="border-l border-slate-200 px-3 py-2 dark:border-slate-700">Ratchet</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.signal_id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-3 py-2 whitespace-nowrap">
                {row.fired_at.slice(0, 16).replace('T', ' ')}
              </td>
              <td className="px-3 py-2 uppercase">{row.direction}</td>
              <td className="px-3 py-2">{row.session_window ?? '—'}</td>
              <td className="px-3 py-2">
                {row.filter_passed ? 'pass' : row.filter_reason ?? 'fail'}
              </td>
              <td className="border-l border-slate-100 px-3 py-2 dark:border-slate-800">
                {formatPips(row.shadow_pips_net)}
              </td>
              <td className="px-3 py-2">
                {formatSeqCell(row.sequenced_status, row.sequenced_pips_net)}
              </td>
              <td className="border-l border-slate-100 px-3 py-2 dark:border-slate-800">
                {formatOptSl(row)}
              </td>
              <td className="px-3 py-2">{formatPips(row.shadow_opt_pips_net)}</td>
              <td className="px-3 py-2">
                {formatSeqCell(row.sequenced_opt_status, row.sequenced_opt_pips_net)}
              </td>
              <td className="border-l border-slate-100 px-3 py-2 dark:border-slate-800">
                {formatPips(row.live_pnl_pips)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
