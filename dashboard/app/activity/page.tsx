'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { BridgeTradeLogRow } from '@/lib/types';
import type { DecisionType } from '@/lib/types';

const PAGE_SIZE = 50;
const DECISIONS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'EXECUTED', label: 'EXECUTED' },
  { value: 'BLOCKED', label: 'BLOCKED' },
  { value: 'SKIPPED', label: 'SKIPPED' },
  { value: 'DEDUPLICATED', label: 'DEDUPLICATED' },
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function toCSV(rows: BridgeTradeLogRow[]): string {
  const headers = ['Time', 'Engine', 'Pair', 'Direction', 'Decision', 'Reason', 'Latency (ms)', 'Status', 'Result', 'Created'];
  const lines = rows.map((r) =>
    [
      formatTime(r.created_at),
      r.engine_id,
      r.pair,
      r.direction,
      r.decision,
      (r.block_reason ?? '').replace(/"/g, '""'),
      r.decision_latency_ms ?? '',
      r.status,
      r.result ?? '',
      r.created_at,
    ].join(',')
  );
  return [headers.join(','), ...lines].join('\n');
}

export default function ActivityPage() {
  const [rows, setRows] = useState<BridgeTradeLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [decision, setDecision] = useState('');
  const [engine, setEngine] = useState('');
  const [engines, setEngines] = useState<string[]>([]);

  const fetchEngines = useCallback(async () => {
    const supabase = getSupabase();
    const { data } = await supabase.from('bridge_engines').select('engine_id').order('engine_id');
    if (data) setEngines((data as { engine_id: string }[]).map((r) => r.engine_id));
  }, []);

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      const supabase = getSupabase();
      let q = supabase
        .from('bridge_trade_log')
        .select('id, signal_id, engine_id, pair, direction, decision, block_reason, decision_latency_ms, status, result, confluence_score, units, risk_amount, pnl_dollars, signal_received_at, created_at')
        .order('created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);
      if (decision) q = q.eq('decision', decision as DecisionType);
      if (engine) q = q.eq('engine_id', engine);
      const { data, error } = await q;
      if (error) {
        setLoading(false);
        return;
      }
      const list = (data ?? []) as BridgeTradeLogRow[];
      setRows((prev) => (append ? [...prev, ...list] : list));
      setHasMore(list.length === PAGE_SIZE);
      setLoading(false);
    },
    [decision, engine]
  );

  useEffect(() => {
    fetchEngines();
  }, [fetchEngines]);

  useEffect(() => {
    setLoading(true);
    setPage(0);
    fetchPage(0, false);
  }, [decision, engine, fetchPage]);

  const loadMore = useCallback(() => {
    const next = page + 1;
    setPage(next);
    setLoading(true);
    fetchPage(next, true);
  }, [page, fetchPage]);

  const handleExportCSV = useCallback(() => {
    const supabase = getSupabase();
    (async () => {
      let q = supabase
        .from('bridge_trade_log')
        .select('id, signal_id, engine_id, pair, direction, decision, block_reason, decision_latency_ms, status, result, created_at')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (decision) q = q.eq('decision', decision as DecisionType);
      if (engine) q = q.eq('engine_id', engine);
      const { data } = await q;
      const list = (data ?? []) as BridgeTradeLogRow[];
      const csv = toCSV(list);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bridge-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    })();
  }, [decision, engine]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Activity</h1>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
        >
          {DECISIONS.map((d) => (
            <option key={d.value} value={d.value}>
              Decision: {d.label}
            </option>
          ))}
        </select>
        <select
          value={engine}
          onChange={(e) => setEngine(e.target.value)}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
        >
          <option value="">All engines</option>
          {engines.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleExportCSV}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="px-4 py-2 font-medium">Time</th>
              <th className="px-4 py-2 font-medium">Engine</th>
              <th className="px-4 py-2 font-medium">Pair</th>
              <th className="px-4 py-2 font-medium">Decision</th>
              <th className="px-4 py-2 font-medium">Reason</th>
              <th className="px-4 py-2 font-medium">Latency</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No activity
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-4 py-2 text-slate-700">{formatTime(row.created_at)}</td>
                  <td className="px-4 py-2 font-medium">{row.engine_id}</td>
                  <td className="px-4 py-2">{row.pair}</td>
                  <td className="px-4 py-2">
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
                  <td className="max-w-[220px] truncate px-4 py-2 text-slate-600" title={row.block_reason ?? undefined}>
                    {row.block_reason ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {row.decision_latency_ms != null ? `${row.decision_latency_ms} ms` : '—'}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{row.status}</td>
                  <td className="px-4 py-2 text-slate-600">{row.result ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasMore && rows.length > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
