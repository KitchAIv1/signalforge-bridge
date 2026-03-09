'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import type { BridgeBrokerRow, BridgeEngineRow, BridgeHealthLogRow, BridgeTradeLogRow } from '@/lib/types';
import { BridgeToggle } from '@/components/BridgeToggle';

const TRADE_LOG_PAGE_SIZE = 25;

function formatTimeAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return d.toLocaleTimeString();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function OverviewPage() {
  const [bridgeActive, setBridgeActive] = useState<boolean>(true);
  const [brokers, setBrokers] = useState<BridgeBrokerRow[]>([]);
  const [engines, setEngines] = useState<BridgeEngineRow[]>([]);
  const [healthLatest, setHealthLatest] = useState<BridgeHealthLogRow | null>(null);
  const [tradeLog, setTradeLog] = useState<BridgeTradeLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = getSupabase();

    const [configRes, brokersRes, enginesRes, healthRes, logRes] = await Promise.all([
      supabase.from('bridge_config').select('config_key, config_value').eq('config_key', 'bridge_active').single(),
      supabase.from('bridge_brokers').select('broker_id, connection_status, last_heartbeat_at, display_name'),
      supabase.from('bridge_engines').select('engine_id, display_name, is_active, execution_threshold, max_daily_trades, trades_today, max_hold_hours').order('engine_id'),
      supabase.from('bridge_health_log').select('id, checked_at, oanda_ok, supabase_ok, broker_connection_status').order('checked_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('bridge_trade_log').select('id, signal_id, engine_id, pair, direction, decision, block_reason, decision_latency_ms, status, result, created_at').order('created_at', { ascending: false }).limit(TRADE_LOG_PAGE_SIZE),
    ]);

    if (configRes.data?.config_value !== undefined) {
      const v = configRes.data.config_value;
      setBridgeActive(v === true || v === 'true');
    }
    if (brokersRes.data) setBrokers(brokersRes.data as BridgeBrokerRow[]);
    if (enginesRes.data) setEngines(enginesRes.data as BridgeEngineRow[]);
    if (healthRes.data) setHealthLatest(healthRes.data as BridgeHealthLogRow);
    if (logRes.data) setTradeLog(logRes.data as BridgeTradeLogRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleBridgeToggle = useCallback(async (next: boolean) => {
    setToggleError(null);
    const supabase = getSupabase();
    const { error } = await supabase.from('bridge_config').update({ config_value: next, updated_at: new Date().toISOString() }).eq('config_key', 'bridge_active');
    if (error) {
      setToggleError(error.message);
      return;
    }
    setBridgeActive(next);
  }, []);

  const oandaBroker = brokers.find((b) => b.broker_id === 'oanda_practice') ?? brokers[0];
  const lastHeartbeat = oandaBroker?.last_heartbeat_at ?? null;
  const oandaOk = healthLatest?.oanda_ok ?? (oandaBroker?.connection_status === 'connected');
  const supabaseOk = healthLatest?.supabase_ok ?? true;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-slate-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Overview</h1>
        <div className="flex items-center gap-3">
          {toggleError && <span className="text-sm text-red-600">{toggleError}</span>}
          <BridgeToggle bridgeActive={bridgeActive} onToggle={handleBridgeToggle} />
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-700">Status</h2>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${oandaOk ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-sm text-slate-700">OANDA</span>
            <span className="text-sm font-medium">{oandaOk ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div className="text-sm text-slate-600">
            Last heartbeat <span className="font-medium text-slate-800">{formatTimeAgo(lastHeartbeat)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${supabaseOk ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-sm text-slate-700">Supabase</span>
            <span className="text-sm font-medium">{supabaseOk ? 'OK' : 'Error'}</span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-700">Engines</h2>
        <div className="flex flex-wrap gap-4">
          {engines.map((e) => (
            <div
              key={e.engine_id}
              className="min-w-[140px] rounded border border-slate-200 bg-slate-50 p-3"
            >
              <div className="font-medium text-slate-900">{e.display_name}</div>
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                <span className={e.is_active ? 'text-emerald-600' : 'text-slate-400'}>
                  {e.is_active ? 'Active' : 'Inactive'}
                </span>
                <span>{e.execution_threshold}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {e.trades_today}/{e.max_daily_trades} today
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">Recent activity</h2>
          <Link href="/activity" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            View all
          </Link>
        </div>
        <div className="overflow-x-auto">
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
              {tradeLog.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500">
                    No activity yet
                  </td>
                </tr>
              ) : (
                tradeLog.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">{formatTime(row.created_at)}</td>
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
      </section>
    </div>
  );
}
