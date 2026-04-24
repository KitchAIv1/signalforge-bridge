'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [panelOpen, setPanelOpen] = useState(false);

  const summaryBracket = useMemo(() => {
    const total = LIVE_ENGINE_ROWS.length;
    const activeCount = LIVE_ENGINE_ROWS.filter((r) => !pausedIds.includes(r.id)).length;
    const pausedCount = total - activeCount;
    if (pausedCount > 0) {
      return `${activeCount} active · ${pausedCount} paused`;
    }
    const directionLabel = omegaDir === 'long' ? 'LONG' : 'SHORT';
    return `${activeCount} active · ${directionLabel}`;
  }, [pausedIds, omegaDir]);

  return (
    <div className="w-full max-md:sticky max-md:top-0 max-md:z-20 max-md:pb-1">
      <div className="w-full border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
        <button
          type="button"
          onClick={() => setPanelOpen((o) => !o)}
          className="flex min-h-[44px] w-full items-center justify-between gap-2 px-2.5 text-left text-sm text-gray-900 dark:text-gray-100"
          aria-expanded={panelOpen}
        >
          <span className="font-medium">⚡ Engine Controls</span>
          <span className="shrink-0 text-sm text-gray-600 tabular-nums dark:text-gray-400">
            [{summaryBracket}]
          </span>
        </button>

        {panelOpen ? (
          <div className="w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            {loadError ? <p className="px-2.5 py-1.5 text-sm text-red-600">{loadError}</p> : null}
            <ul className="w-full">
              {LIVE_ENGINE_ROWS.map((row) => {
                const paused = pausedIds.includes(row.id);
                return (
                  <li
                    key={row.id}
                    className="flex min-h-[44px] w-full items-center border-b border-gray-200 px-2.5 py-1.5 last:border-b-0 dark:border-gray-800"
                  >
                    <div className="flex w-full min-w-0 items-center justify-between gap-2">
                      <span className="shrink-0 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {row.display}
                      </span>
                      {row.id === 'omega' ? (
                        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => void togglePause(row.id, row.display)}
                            className={`inline-flex h-8 min-w-[2.75rem] shrink-0 items-center justify-center border px-2 text-sm font-semibold max-md:min-h-[44px] md:min-w-[4.5rem] ${
                              paused
                                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                            }`}
                          >
                            <span className="md:hidden">{paused ? 'OFF' : 'ON'}</span>
                            <span className="hidden md:inline">{paused ? '● PAUSED' : '● LIVE'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void flipOmega()}
                            className={`inline-flex h-8 min-w-[2.5rem] shrink-0 items-center justify-center border px-2 text-sm font-semibold max-md:min-h-[44px] md:min-w-[4.5rem] ${
                              omegaDir === 'long'
                                ? 'border-gray-200 bg-gray-100 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
                                : 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100'
                            }`}
                          >
                            <span className="md:hidden">{omegaDir === 'long' ? 'L' : 'S'}</span>
                            <span className="hidden md:inline">
                              {omegaDir === 'long' ? '↑ LONG' : '↓ SHORT'}
                            </span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-1 justify-end">
                          <button
                            type="button"
                            onClick={() => void togglePause(row.id, row.display)}
                            className={`inline-flex h-8 min-w-[2.75rem] items-center justify-center border px-2.5 text-sm font-semibold max-md:min-h-[44px] md:min-w-[4.5rem] ${
                              paused
                                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                            }`}
                          >
                            <span className="md:hidden">{paused ? 'OFF' : 'ON'}</span>
                            <span className="hidden md:inline">{paused ? '● PAUSED' : '● LIVE'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {lastSyncedUtc ? (
              <p className="px-2.5 py-1.5 text-sm text-gray-500 dark:text-gray-500">
                Last synced: {lastSyncedUtc}
              </p>
            ) : null}
            {toast ? (
              <p
                className="border-t border-gray-200 px-2.5 py-1.5 text-sm text-emerald-800 dark:border-gray-800 dark:text-emerald-200"
                role="status"
              >
                {toast}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
