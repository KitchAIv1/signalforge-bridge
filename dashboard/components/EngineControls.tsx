'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

const KEY_PAUSED = 'paused_engines';
const KEY_OMEGA_DIR = 'omega_direction';
const TOAST_MS = 4000;

const LIVE_ENGINE_ROWS = [
  { id: 'omega', display: 'Omega' },
  { id: 'engine_rebuild', display: 'Rebuild' },
  { id: 'falcon', display: 'Falcon' },
  { id: 'sigma', display: 'Sigma' },
] as const;

function parseOmegaDir(raw: unknown): 'long' | 'short' {
  if (raw === 'short' || raw === 'SHORT') return 'short';
  if (typeof raw === 'string' && raw.toLowerCase() === 'short') return 'short';
  return 'long';
}

function parsePaused(raw: unknown): string[] {
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
    return raw as string[];
  }
  return [];
}

async function fetchRows(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('bridge_config')
    .select('config_key, config_value')
    .in('config_key', [KEY_PAUSED, KEY_OMEGA_DIR]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ config_key: string; config_value: unknown }>;
  const pa = rows.find((r) => r.config_key === KEY_PAUSED);
  const om = rows.find((r) => r.config_key === KEY_OMEGA_DIR);
  return { pausedIds: parsePaused(pa?.config_value), omegaDir: parseOmegaDir(om?.config_value) };
}

async function writePaused(supabase: SupabaseClient, ids: string[]) {
  const { error } = await supabase
    .from('bridge_config')
    .update({ config_value: ids, updated_at: new Date().toISOString() })
    .eq('config_key', KEY_PAUSED);
  if (error) throw new Error(error.message);
}

async function writeOmegaDir(supabase: SupabaseClient, dir: 'long' | 'short') {
  const { error } = await supabase
    .from('bridge_config')
    .update({ config_value: dir, updated_at: new Date().toISOString() })
    .eq('config_key', KEY_OMEGA_DIR);
  if (error) throw new Error(error.message);
}

function useEngineControlsState() {
  const [pausedIds, setPausedIds] = useState<string[]>([]);
  const [omegaDir, setOmegaDir] = useState<'long' | 'short'>('long');
  const [lastSyncedUtc, setLastSyncedUtc] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  const sync = useCallback(async () => {
    setLoadError(null);
    try {
      const s = getSupabase();
      const { pausedIds: p, omegaDir: d } = await fetchRows(s);
      setPausedIds(p);
      setOmegaDir(d);
      setLastSyncedUtc(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void sync();
    const t = window.setInterval(() => void sync(), 15_000);
    return () => clearInterval(t);
  }, [sync]);
  const togglePause = useCallback(
    async (engineId: string, display: string) => {
      const isP = pausedIds.includes(engineId);
      const next = isP ? pausedIds.filter((e) => e !== engineId) : [...pausedIds, engineId];
      try {
        await writePaused(getSupabase(), next);
        setPausedIds(next);
        showToast(
          isP
            ? display === 'Omega' ? 'Omega resumed' : `${display} resumed`
            : display === 'Omega'
              ? 'Omega paused — takes effect on next signal'
              : `${display} paused — takes effect on next signal`
        );
        void sync();
      } catch (e) {
        showToast(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [pausedIds, showToast, sync]
  );
  const flipOmega = useCallback(async () => {
    const newD: 'long' | 'short' = omegaDir === 'long' ? 'short' : 'long';
    try {
      await writeOmegaDir(getSupabase(), newD);
      setOmegaDir(newD);
      showToast(newD === 'short' ? 'Omega → SHORT' : 'Omega → LONG');
      void sync();
    } catch (e) {
      showToast(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [omegaDir, showToast, sync]);
  return { pausedIds, omegaDir, lastSyncedUtc, toast, loadError, togglePause, flipOmega };
}

export function EngineControls() {
  const { pausedIds, omegaDir, lastSyncedUtc, toast, loadError, togglePause, flipOmega } =
    useEngineControlsState();
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
      <h2 className="text-sm font-semibold text-slate-800">Engine controls</h2>
      {loadError ? <p className="text-xs text-red-600">{loadError}</p> : null}
      <ul className="space-y-2">
        {LIVE_ENGINE_ROWS.map((row) => {
          const paused = pausedIds.includes(row.id);
          return (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0"
            >
              <span className="text-sm font-medium text-slate-800">{row.display}</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void togglePause(row.id, row.display)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    paused ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {paused ? '● PAUSED' : '● LIVE'}
                </button>
                {row.id === 'omega' ? (
                  <button
                    type="button"
                    onClick={() => void flipOmega()}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      omegaDir === 'long' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {omegaDir === 'long' ? '↑ LONG' : '↓ SHORT'}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {lastSyncedUtc ? <p className="text-xs text-slate-500">Last synced: {lastSyncedUtc}</p> : null}
      {toast ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" role="status">
          {toast}
        </p>
      ) : null}
    </div>
  );
}
