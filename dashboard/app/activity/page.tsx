'use client';

import { useCallback, useEffect, useState } from 'react';
import { EngineControls } from '@/components/EngineControls';
import { AccountSnapshotBar } from '@/components/AccountSnapshotBar';
import { getSupabase } from '@/lib/supabase';
import type { BridgeTradeLogRow } from '@/lib/types';
import type { DecisionType } from '@/lib/types';
import { EngineStatusIndicator } from '@/components/EngineStatusIndicator';
import { useEngineControlsState } from '@/hooks/useEngineControlsState';
import { useRebuildHourGate } from '@/hooks/useRebuildHourGate';
import { usePresencePing } from '@/hooks/usePresencePing';
import { ActivityTradeDesktopTable } from '@/components/activity/ActivityTradeDesktopTable';
import { ActivityTradeMobileList } from '@/components/activity/ActivityTradeMobileList';
import { RegimePanel } from '@/components/RegimePanel';
import { AmdPanel } from '@/components/AmdPanel';
import { AsianDirectionPanel } from '@/components/AsianDirectionPanel';
import { NewsEventStrip } from '@/components/activity/NewsEventStrip';
import { PresenceIndicator } from '@/components/PresenceIndicator';

const PAGE_SIZE = 50;

const EXPANDED_TRADE_LOG_SELECT =
  'id, signal_id, engine_id, pair, direction, decision, block_reason, status, result, ' +
  'confluence_score, units, risk_amount, pnl_dollars, fill_price, exit_price, stop_loss, ' +
  'take_profit, pnl_pips, pnl_r, lot_size, close_reason, duration_minutes, ' +
  'signal_received_at, created_at, regime_direction, regime_confidence, regime_evaluated_at, ' +
  'signal_session, close_tag, manual_tag, ' +
  'layer4_result, layer4_bullish_count, layer4_bearish_count, ' +
  'layer5_result, layer5_pip_diff, layer6_position_pct, choppy_extended, amd_tag, direction_source, amd_size_multiplier';

const DECISIONS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'EXECUTED', label: 'EXECUTED' },
  { value: 'BLOCKED', label: 'BLOCKED' },
  { value: 'SKIPPED', label: 'SKIPPED' },
  { value: 'DEDUPLICATED', label: 'DEDUPLICATED' },
];

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

export default function ActivityPage() {
  const [rows, setRows] = useState<BridgeTradeLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [decision, setDecision] = useState('EXECUTED');
  const [engine, setEngine] = useState('');
  const [engines, setEngines] = useState<string[]>([]);
  const { omegaDir } = useEngineControlsState();
  const rebuildHourGateCtrl = useRebuildHourGate();
  usePresencePing(); // 60s heartbeat — bridge can treat as watching for omega sizing

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
      const list = (data ?? []) as unknown as BridgeTradeLogRow[];
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
      const list = (data ?? []) as unknown as BridgeTradeLogRow[];
      const csv = toCSV(list);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const anchor = document.createElement('a');
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `bridge-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
    })();
  }, [decision, engine]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Activity</h1>

      <div className="relative z-10 flex min-w-0 flex-wrap items-center gap-3">
        <select
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          className="min-w-0 max-w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
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
          className="min-w-0 max-w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
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
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Export CSV
        </button>
        <EngineStatusIndicator
          omegaDir={omegaDir}
          rebuildHourGateEnabled={rebuildHourGateCtrl.hourGateEnabled}
        />
        <EngineControls hourGateControl={rebuildHourGateCtrl} />
        <PresenceIndicator />
      </div>

      <AccountSnapshotBar />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AsianDirectionPanel />
        <div className="flex flex-col gap-4">
          <RegimePanel />
          <AmdPanel compact />
        </div>
      </div>

      <NewsEventStrip />

      <ActivityTradeMobileList rows={rows} isTradeListLoading={loading} />
      <ActivityTradeDesktopTable rows={rows} isTradeListLoading={loading} />

      {hasMore && rows.length > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
