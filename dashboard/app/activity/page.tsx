'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { BridgeTradeLogRow } from '@/lib/types';
import type { DecisionType } from '@/lib/types';

const PAGE_SIZE = 50;
const TABLE_COL_COUNT = 17;

const EXPANDED_TRADE_LOG_SELECT =
  'id, signal_id, engine_id, pair, direction, decision, block_reason, decision_latency_ms, status, result, confluence_score, units, risk_amount, pnl_dollars, fill_price, exit_price, stop_loss, take_profit, pnl_pips, pnl_r, lot_size, slippage_pips, close_reason, duration_minutes, signal_received_at, created_at';

const DECISIONS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'EXECUTED', label: 'EXECUTED' },
  { value: 'BLOCKED', label: 'BLOCKED' },
  { value: 'SKIPPED', label: 'SKIPPED' },
  { value: 'DEDUPLICATED', label: 'DEDUPLICATED' },
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    hour12: false,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function toCSV(rows: BridgeTradeLogRow[]): string {
  const headers = [
    'Time',
    'Engine',
    'Pair',
    'Direction',
    'Score',
    'Decision',
    'Reason',
    'Fill',
    'SL',
    'TP',
    'Exit',
    'Lots',
    'PnL $',
    'Pips',
    'R',
    'Duration (min)',
    'Close Reason',
    'Status',
    'Result',
  ];
  const lines = rows.map((row) =>
    [
      row.created_at,
      row.engine_id,
      row.pair,
      row.direction,
      row.confluence_score ?? '',
      row.decision,
      (row.block_reason ?? '').replace(/"/g, '""'),
      row.fill_price ?? '',
      row.stop_loss ?? '',
      row.take_profit ?? '',
      row.exit_price ?? '',
      row.lot_size ?? '',
      row.pnl_dollars ?? '',
      row.pnl_pips ?? '',
      row.pnl_r ?? '',
      row.duration_minutes ?? '',
      (row.close_reason ?? '').replace(/"/g, '""'),
      row.status,
      row.result ?? '',
    ].join(',')
  );
  return [headers.join(','), ...lines].join('\n');
}

function ActivityTradeTableRow({ row }: { row: BridgeTradeLogRow }) {
  const isExecuted = row.decision === 'EXECUTED';
  const isWin = row.result === 'win';
  const isLoss = row.result === 'loss';
  const pnlColor = isWin ? 'text-emerald-600' : isLoss ? 'text-red-500' : 'text-slate-500';
  const resultBadge = row.result
    ? isWin
      ? 'bg-emerald-100 text-emerald-700'
      : isLoss
        ? 'bg-red-100 text-red-700'
        : 'bg-slate-100 text-slate-600'
    : '';
  const decisionBadge =
    row.decision === 'EXECUTED'
      ? 'bg-emerald-100 text-emerald-700'
      : row.decision === 'BLOCKED'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700';

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50">
      <td className="px-3 py-2 text-xs text-slate-600">{formatTime(row.created_at)}</td>
      <td className="px-3 py-2 text-xs font-medium">{row.engine_id}</td>
      <td className="px-3 py-2 text-xs">{row.pair}</td>
      <td className="px-3 py-2 text-xs font-medium">
        {row.direction === 'long' || row.direction === 'LONG' ? (
          <span className="text-emerald-600">LONG</span>
        ) : (
          <span className="text-red-500">SHORT</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">{row.confluence_score ?? '—'}</td>
      <td className="px-3 py-2 text-xs">
        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${decisionBadge}`}>{row.decision}</span>
      </td>
      <td className="max-w-[160px] truncate px-3 py-2 text-xs text-slate-500" title={row.block_reason ?? ''}>
        {row.block_reason ?? '—'}
      </td>
      <td className="px-3 py-2 text-xs">
        {isExecuted && row.fill_price != null ? Number(row.fill_price).toFixed(5) : '—'}
      </td>
      <td className="px-3 py-2 text-xs">
        {isExecuted && row.stop_loss != null ? Number(row.stop_loss).toFixed(5) : '—'}
      </td>
      <td className="px-3 py-2 text-xs">
        {isExecuted && row.take_profit != null ? Number(row.take_profit).toFixed(5) : '—'}
      </td>
      <td className="px-3 py-2 text-xs">
        {isExecuted && row.exit_price != null ? Number(row.exit_price).toFixed(5) : '—'}
      </td>
      <td className="px-3 py-2 text-xs">
        {isExecuted && row.lot_size != null ? Number(row.lot_size).toFixed(2) : '—'}
      </td>
      <td className={`px-3 py-2 text-xs font-medium ${pnlColor}`}>
        {row.pnl_dollars != null ? (row.pnl_dollars >= 0 ? '+' : '') + Number(row.pnl_dollars).toFixed(2) : '—'}
      </td>
      <td className={`px-3 py-2 text-xs ${pnlColor}`}>
        {row.pnl_pips != null ? (row.pnl_pips >= 0 ? '+' : '') + Number(row.pnl_pips).toFixed(1) : '—'}
      </td>
      <td className={`px-3 py-2 text-xs ${pnlColor}`}>
        {row.pnl_r != null ? (row.pnl_r >= 0 ? '+' : '') + Number(row.pnl_r).toFixed(2) + 'R' : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">
        {row.duration_minutes != null ? Math.round(Number(row.duration_minutes)) + 'm' : '—'}
      </td>
      <td className="px-3 py-2 text-xs">
        {row.result ? (
          <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${resultBadge}`}>{row.result}</span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
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
        .select(EXPANDED_TRADE_LOG_SELECT)
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
        .select(EXPANDED_TRADE_LOG_SELECT)
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
        <table className="w-full min-w-[1600px] text-left text-sm">
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={TABLE_COL_COUNT} className="px-4 py-8 text-center text-slate-500">
                  No activity
                </td>
              </tr>
            ) : (
              rows.map((row) => <ActivityTradeTableRow key={row.id} row={row} />)
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
