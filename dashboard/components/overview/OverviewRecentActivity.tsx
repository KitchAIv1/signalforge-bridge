'use client';

import Link from 'next/link';
import type { BridgeTradeLogRow } from '@/lib/types';

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface OverviewRecentActivityProps {
  tradeRows: BridgeTradeLogRow[];
}

export function OverviewRecentActivity({ tradeRows }: OverviewRecentActivityProps) {
  const hasRows = tradeRows.length > 0;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="pb-2 pr-4 font-medium">Time</th>
              <th className="pb-2 pr-4 font-medium">Engine</th>
              <th className="pb-2 pr-4 font-medium">Pair</th>
              <th className="pb-2 pr-4 font-medium">Decision</th>
              <th className="pb-2 pr-4 font-medium">Reason</th>
              <th className="pb-2 pr-4 font-medium">Latency</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {!hasRows ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-500">
                  No activity yet
                </td>
              </tr>
            ) : (
              tradeRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4 text-slate-700">{formatClock(row.created_at)}</td>
                  <td className="py-2 pr-4 font-medium">{row.engine_id}</td>
                  <td className="py-2 pr-4">{row.pair}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        row.decision === 'EXECUTED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : row.decision === 'BLOCKED'
                            ? 'bg-red-100 text-red-800'
                            : row.decision === 'SKIPPED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {row.decision}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate py-2 pr-4 text-slate-600" title={row.block_reason ?? undefined}>
                    {row.block_reason ?? '—'}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {row.decision_latency_ms != null ? `${row.decision_latency_ms} ms` : '—'}
                  </td>
                  <td className="py-2 text-slate-600">{row.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {!hasRows ? (
          <div className="py-6 text-center text-sm text-slate-500">No activity yet</div>
        ) : (
          tradeRows.map((row) => (
            <div key={row.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-500">{formatClock(row.created_at)}</div>
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                    row.decision === 'EXECUTED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : row.decision === 'BLOCKED'
                        ? 'bg-red-100 text-red-800'
                        : row.decision === 'SKIPPED'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {row.decision}
                </span>
              </div>
              <div className="mt-2 font-medium text-slate-900">
                {row.engine_id} · {row.pair}
              </div>
              <div className="mt-1 break-words text-xs text-slate-600">{row.block_reason ?? '—'}</div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>Latency: {row.decision_latency_ms != null ? `${row.decision_latency_ms} ms` : '—'}</span>
                <span>{row.status}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

export function OverviewRecentHeader() {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-sm font-medium text-slate-700">Recent activity</h2>
      <Link href="/activity" className="text-sm font-medium text-slate-600 hover:text-slate-900">
        View all
      </Link>
    </div>
  );
}
