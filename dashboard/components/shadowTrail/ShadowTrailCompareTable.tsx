'use client';

import type { ShadowTrailRow } from '@/lib/shadowTrailTypes';

interface ShadowTrailCompareTableProps {
  rows: ShadowTrailRow[];
}

function formatPips(value: number | null): string {
  if (value == null) return '—';
  return `${value.toFixed(1)}p`;
}

export function ShadowTrailCompareTable({ rows }: ShadowTrailCompareTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
          <tr>
            <th className="px-3 py-2">Time (UTC)</th>
            <th className="px-3 py-2">Dir</th>
            <th className="px-3 py-2">Window</th>
            <th className="px-3 py-2">Filter</th>
            <th className="px-3 py-2">Shadow</th>
            <th className="px-3 py-2">Seq</th>
            <th className="px-3 py-2">Live</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.signal_id} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-3 py-2 whitespace-nowrap">{row.fired_at.slice(0, 16).replace('T', ' ')}</td>
              <td className="px-3 py-2 uppercase">{row.direction}</td>
              <td className="px-3 py-2">{row.session_window ?? '—'}</td>
              <td className="px-3 py-2">
                {row.filter_passed ? 'pass' : row.filter_reason ?? 'fail'}
              </td>
              <td className="px-3 py-2">{formatPips(row.shadow_pips_net)}</td>
              <td className="px-3 py-2">
                {row.sequenced_status === 'executed'
                  ? formatPips(row.sequenced_pips_net)
                  : row.sequenced_status ?? '—'}
              </td>
              <td className="px-3 py-2">{formatPips(row.live_pnl_pips)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
