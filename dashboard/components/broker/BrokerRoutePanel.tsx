'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

interface BrokerLinkRow {
  engine_id: string;
  broker_id: string;
  is_active: boolean;
  capital_allocation_pct: number;
  display_name?: string;
}

export function BrokerRoutePanel() {
  const [links, setLinks] = useState<BrokerLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('bridge_links')
      .select('engine_id, broker_id, is_active, capital_allocation_pct')
      .in('engine_id', ['omega', 'audusd_fade'])
      .order('engine_id');
    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }
    const brokerIds = [...new Set((data ?? []).map((row) => row.broker_id as string))];
    const { data: brokers } = await supabase
      .from('bridge_brokers')
      .select('broker_id, display_name')
      .in('broker_id', brokerIds);
    const nameById = new Map(
      (brokers ?? []).map((row) => [row.broker_id as string, row.display_name as string]),
    );
    setLinks(
      (data ?? []).map((row) => ({
        ...(row as BrokerLinkRow),
        display_name: nameById.get(row.broker_id as string) ?? row.broker_id,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchLinks();
  }, [fetchLinks]);

  const toggleLink = useCallback(async (link: BrokerLinkRow) => {
    setErrorMessage(null);
    const supabase = getSupabase();
    const { error } = await supabase
      .from('bridge_links')
      .update({ is_active: !link.is_active })
      .eq('engine_id', link.engine_id)
      .eq('broker_id', link.broker_id);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    await fetchLinks();
  }, [fetchLinks]);

  const disableAllVt = useCallback(async () => {
    setErrorMessage(null);
    const supabase = getSupabase();
    const { error } = await supabase
      .from('bridge_links')
      .update({ is_active: false })
      .like('broker_id', 'vtmarkets_%');
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    await fetchLinks();
  }, [fetchLinks]);

  if (loading) return <p className="text-sm text-slate-500">Loading broker routes…</p>;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-700">Broker routes</h2>
        <button
          type="button"
          onClick={() => void disableAllVt()}
          className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
        >
          Rollback: OANDA-only (disable VT)
        </button>
      </div>
      {errorMessage && (
        <p className="mb-2 text-sm text-red-600">{errorMessage}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="pb-2 pr-4 font-medium">Engine</th>
              <th className="pb-2 pr-4 font-medium">Broker</th>
              <th className="pb-2 pr-4 font-medium">Alloc %</th>
              <th className="pb-2 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {links.map((link) => (
              <tr key={`${link.engine_id}-${link.broker_id}`} className="border-b border-slate-100">
                <td className="py-2 pr-4">{link.engine_id}</td>
                <td className="py-2 pr-4">{link.display_name ?? link.broker_id}</td>
                <td className="py-2 pr-4">{(link.capital_allocation_pct * 100).toFixed(0)}%</td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() => void toggleLink(link)}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      link.is_active
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {link.is_active ? 'On' : 'Off'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
