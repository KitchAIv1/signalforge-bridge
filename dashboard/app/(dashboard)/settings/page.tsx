'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { BridgeToggle } from '@/components/BridgeToggle';

interface ConfigRow {
  config_key: string;
  config_value: unknown;
  description?: string | null;
}

export default function SettingsPage() {
  const [bridgeActive, setBridgeActive] = useState<boolean>(true);
  const [killSwitch, setKillSwitch] = useState<boolean>(false);
  const [configList, setConfigList] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    const supabase = getSupabase();
    const { data } = await supabase.from('bridge_config').select('config_key, config_value, description').in('config_key', ['bridge_active', 'kill_switch']);
    if (data) {
      const rows = data as ConfigRow[];
      setConfigList(rows);
      for (const r of rows) {
        const v = r.config_value;
        const bool = v === true || v === 'true';
        if (r.config_key === 'bridge_active') setBridgeActive(bool);
        if (r.config_key === 'kill_switch') setKillSwitch(bool);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

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

  const handleKillSwitchToggle = useCallback(async () => {
    setToggleError(null);
    const next = !killSwitch;
    const supabase = getSupabase();
    const { error } = await supabase.from('bridge_config').update({ config_value: next, updated_at: new Date().toISOString() }).eq('config_key', 'kill_switch');
    if (error) {
      setToggleError(error.message);
      return;
    }
    setKillSwitch(next);
  }, [killSwitch]);

  const bridgeDesc = configList.find((r) => r.config_key === 'bridge_active')?.description ?? 'Master on/off. When off, bridge stops processing (or exits on next restart).';
  const killDesc = configList.find((r) => r.config_key === 'kill_switch')?.description ?? 'Emergency halt all trading.';

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-slate-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>

      {toggleError && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {toggleError}
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-medium text-slate-700">System</h2>

        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4 rounded border border-slate-100 bg-slate-50/50 p-4">
            <div>
              <div className="font-medium text-slate-800">Bridge</div>
              <div className="mt-1 text-sm text-slate-600">{bridgeDesc}</div>
            </div>
            <BridgeToggle bridgeActive={bridgeActive} onToggle={handleBridgeToggle} />
          </div>

          <div className="flex flex-wrap items-start justify-between gap-4 rounded border border-slate-100 bg-slate-50/50 p-4">
            <div>
              <div className="font-medium text-slate-800">Kill switch</div>
              <div className="mt-1 text-sm text-slate-600">{killDesc}</div>
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Kill switch</span>
              <button
                type="button"
                role="switch"
                aria-checked={killSwitch}
                onClick={handleKillSwitchToggle}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  killSwitch ? 'bg-red-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    killSwitch ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className={`text-sm font-medium ${killSwitch ? 'text-red-700' : 'text-slate-500'}`}>
                {killSwitch ? 'ON' : 'OFF'}
              </span>
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
