'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { BridgeBrokerRow, BridgeHealthLogRow } from '@/lib/types';

const HEALTH_HISTORY_SIZE = 50;

function formatTimeAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return d.toLocaleTimeString();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function HealthPage() {
  const [brokers, setBrokers] = useState<BridgeBrokerRow[]>([]);
  const [healthHistory, setHealthHistory] = useState<BridgeHealthLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const supabase = getSupabase();
    const [brokersRes, healthRes] = await Promise.all([
      supabase.from('bridge_brokers').select('broker_id, connection_status, last_heartbeat_at, display_name'),
      supabase
        .from('bridge_health_log')
        .select('id, checked_at, oanda_ok, supabase_ok, broker_connection_status')
        .order('checked_at', { ascending: false })
        .limit(HEALTH_HISTORY_SIZE),
    ]);
    if (brokersRes.data) setBrokers(brokersRes.data as BridgeBrokerRow[]);
    if (healthRes.data) setHealthHistory(healthRes.data as BridgeHealthLogRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);

    const supabase = getSupabase();
    const channel = supabase
      .channel('health-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bridge_health_log' },
        () => { void fetchData(); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bridge_brokers' },
        () => { void fetchData(); }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const oandaBroker = brokers.find((b) => b.broker_id === 'oanda_practice') ?? brokers[0];
  const lastHeartbeat = oandaBroker?.last_heartbeat_at ?? null;
  const latestHealth = healthHistory[0] ?? null;
  const oandaOk = latestHealth?.oanda_ok ?? (oandaBroker?.connection_status === 'connected');
  const supabaseOk = latestHealth?.supabase_ok ?? true;

  const totalChecks = healthHistory.length;
  const failures = healthHistory.filter((r) => !r.oanda_ok || !r.supabase_ok);
  const failureCount = failures.length;
  const lastFailure = failures[0] ?? null;
  const uptimePct = totalChecks > 0 ? Math.round(((totalChecks - failureCount) / totalChecks) * 100) : 100;
  const historyMinutes = totalChecks > 0 ? Math.round((totalChecks * 30) / 60) : 0;
  const timelineRows = [...healthHistory].reverse();
  const RECENT_TABLE_ROWS = 10;
  const [showAllHistory, setShowAllHistory] = useState(false);
  const tableRows = showAllHistory ? healthHistory : healthHistory.slice(0, RECENT_TABLE_ROWS);
  const hasMoreHistory = healthHistory.length > RECENT_TABLE_ROWS;

  if (loading && healthHistory.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-slate-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Health</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-700">Current</h2>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${oandaOk ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-sm text-slate-700">OANDA</span>
            <span className="text-sm font-medium">{oandaOk ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${supabaseOk ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-sm text-slate-700">Supabase</span>
            <span className="text-sm font-medium">{supabaseOk ? 'OK' : 'Error'}</span>
          </div>
          <div className="text-sm text-slate-600">
            Last heartbeat <span className="font-medium text-slate-800">{formatTimeAgo(lastHeartbeat)}</span>
            {lastHeartbeat && <span className="ml-1 text-slate-500">({formatTime(lastHeartbeat)})</span>}
          </div>
        </div>
        {totalChecks > 0 && (
          <p className="mt-3 text-sm text-slate-600">
            Last {historyMinutes} min: {totalChecks} checks, {uptimePct}% uptime
            {failureCount > 0 && lastFailure && (
              <span className="ml-1 text-red-600">
                ({failureCount} failure{failureCount !== 1 ? 's' : ''}
                {!lastFailure.oanda_ok && ' OANDA'}
                {!lastFailure.supabase_ok && ' Supabase'}
                {` at ${formatTime(lastFailure.checked_at)}`})
              </span>
            )}
          </p>
        )}
      </section>

      {timelineRows.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-medium text-slate-700">Timeline</h2>
          <div className="flex flex-wrap gap-0.5" role="img" aria-label={`${totalChecks} checks, ${uptimePct}% uptime`}>
            {timelineRows.map((row) => {
              const ok = row.oanda_ok && row.supabase_ok;
              return (
                <span
                  key={row.id}
                  className={`h-2 w-2 min-w-[8px] flex-shrink-0 rounded-sm ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
                  title={`${formatTime(row.checked_at)} — ${ok ? 'ok' : !row.oanda_ok ? 'OANDA fail' : 'Supabase fail'}`}
                />
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">Left: oldest · Right: newest · Green: ok, red: failure</p>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-700">Recent checks</h2>
        <p className="mb-2 text-xs text-slate-500">
          Last {tableRows.length} of {healthHistory.length} (heartbeat every 30s). Use timeline above for at-a-glance status.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[400px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="pb-2 pr-4 font-medium">Checked at</th>
                <th className="pb-2 pr-4 font-medium">OANDA</th>
                <th className="pb-2 pr-4 font-medium">Supabase</th>
                <th className="pb-2 font-medium">Broker status</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500">
                    No health records yet
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">{formatTime(row.checked_at)}</td>
                    <td className="py-2 pr-4">
                      <span className={row.oanda_ok ? 'text-emerald-600' : 'text-red-600'}>
                        {row.oanda_ok ? 'ok' : 'fail'}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={row.supabase_ok ? 'text-emerald-600' : 'text-red-600'}>
                        {row.supabase_ok ? 'ok' : 'fail'}
                      </span>
                    </td>
                    <td className="py-2 text-slate-600">{row.broker_connection_status ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {hasMoreHistory && (
          <button
            type="button"
            onClick={() => setShowAllHistory((prev) => !prev)}
            className="mt-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            {showAllHistory ? `Show last ${RECENT_TABLE_ROWS} only` : `Show all ${healthHistory.length}`}
          </button>
        )}
      </section>
    </div>
  );
}
