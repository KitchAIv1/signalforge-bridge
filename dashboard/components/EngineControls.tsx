'use client';

import { useEffect, useRef, useState } from 'react';
import { useEngineControlsState } from '@/hooks/useEngineControlsState';

const LIVE_ENGINE_ROWS = [
  { id: 'omega', display: 'Omega' },
  { id: 'engine_rebuild', display: 'Rebuild' },
  { id: 'falcon', display: 'Falcon' },
  { id: 'sigma', display: 'Sigma' },
] as const;

export function EngineControls() {
  const {
    pausedIds,
    omegaDir,
    rebuildRetry,
    lastSyncedUtc,
    toast,
    loadError,
    togglePause,
    flipOmega,
    toggleRebuildRetry,
  } = useEngineControlsState();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const closeIfOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', closeIfOutside);
    return () => document.removeEventListener('mousedown', closeIfOutside);
  }, [dropdownOpen]);

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={() => setDropdownOpen((open) => !open)}
        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
      >
        {dropdownOpen ? '⚡ Controls ▴' : '⚡ Controls ▾'}
      </button>

      {dropdownOpen ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 border border-slate-200 bg-white shadow-md">
          {loadError ? <p className="px-2.5 py-1.5 text-sm text-red-600">{loadError}</p> : null}
          <ul className="w-full">
            {LIVE_ENGINE_ROWS.map((row) => {
              const paused = pausedIds.includes(row.id);
              return (
                <li
                  key={row.id}
                  className="flex min-h-[44px] w-full items-center border-b border-slate-200 px-2.5 py-1.5 last:border-b-0"
                >
                  <div className="flex w-full min-w-0 items-center justify-between gap-2">
                    <span className="shrink-0 text-sm font-medium text-slate-900">{row.display}</span>
                    {row.id === 'omega' ? (
                      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void togglePause(row.id, row.display)}
                          className={`inline-flex h-8 min-w-[2.75rem] shrink-0 items-center justify-center border px-2 text-sm font-semibold max-md:min-h-[44px] md:min-w-[4.5rem] ${
                            paused
                              ? 'border-red-200 bg-red-50 text-red-800'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
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
                              ? 'border-slate-200 bg-slate-100 text-slate-800'
                              : 'border-amber-300 bg-amber-100 text-amber-900'
                          }`}
                        >
                          <span className="md:hidden">{omegaDir === 'long' ? 'L' : 'S'}</span>
                          <span className="hidden md:inline">
                            {omegaDir === 'long' ? '↑ LONG' : '↓ SHORT'}
                          </span>
                        </button>
                      </div>
                    ) : row.id === 'engine_rebuild' ? (
                      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void togglePause(row.id, row.display)}
                          className={`inline-flex h-8 min-w-[2.75rem] shrink-0 items-center justify-center border px-2 text-sm font-semibold max-md:min-h-[44px] md:min-w-[4.5rem] ${
                            paused
                              ? 'border-red-200 bg-red-50 text-red-800'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          <span className="md:hidden">{paused ? 'OFF' : 'ON'}</span>
                          <span className="hidden md:inline">{paused ? '● PAUSED' : '● LIVE'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleRebuildRetry()}
                          className={`inline-flex h-8 min-w-[2.5rem] shrink-0 items-center justify-center border px-2 text-xs font-semibold max-md:min-h-[44px] md:min-w-[4.5rem] ${
                            rebuildRetry
                              ? 'border-violet-300 bg-violet-100 text-violet-900'
                              : 'border-slate-200 bg-slate-100 text-slate-600'
                          }`}
                          title="Retry market order without 2-pip priceBound when OANDA returns BOUNDS_VIOLATION"
                        >
                          <span className="md:hidden">{rebuildRetry ? 'R+' : 'R−'}</span>
                          <span className="hidden md:inline">{rebuildRetry ? '↻ Retry ON' : '↻ Retry OFF'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-1 justify-end">
                        <button
                          type="button"
                          onClick={() => void togglePause(row.id, row.display)}
                          className={`inline-flex h-8 min-w-[2.75rem] items-center justify-center border px-2.5 text-sm font-semibold max-md:min-h-[44px] md:min-w-[4.5rem] ${
                            paused
                              ? 'border-red-200 bg-red-50 text-red-800'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
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
            <p className="px-2.5 py-1.5 text-sm text-slate-500">Last synced: {lastSyncedUtc}</p>
          ) : null}
          {toast ? (
            <p
              className="border-t border-slate-200 px-2.5 py-1.5 text-sm text-emerald-800"
              role="status"
            >
              {toast}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
