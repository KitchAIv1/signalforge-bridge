'use client';

import { useEffect, useRef, useState } from 'react';
import { useEngineControlsState } from '@/hooks/useEngineControlsState';
import type { RebuildHourGateControl } from '@/hooks/useRebuildHourGate';
import { RebuildHourGateSwitch } from '@/components/RebuildHourGateSwitch';

const LIVE_ENGINE_ROWS = [
  { id: 'omega', display: 'Omega' },
  { id: 'omega_inverse', display: 'Omega Inverse' },
  { id: 'engine_rebuild', display: 'Rebuild' },
  { id: 'falcon', display: 'Falcon' },
  { id: 'sigma', display: 'Sigma' },
] as const;

interface EngineControlsProps {
  hourGateControl: RebuildHourGateControl;
}

export function EngineControls({ hourGateControl: hourGateCtrl }: EngineControlsProps) {
  const {
    pausedIds,
    omegaDir,
    rebuildRetry,
    directionMode,
    omegaRawMode,
    lastSyncedUtc,
    toast,
    loadError,
    togglePause,
    flipOmega,
    toggleDirectionMode,
    toggleRebuildRetry,
    toggleOmegaRawMode,
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
        <div className="absolute right-0 top-full z-50 mt-1 w-max min-w-[16rem] max-w-[calc(100vw-1rem)] border border-slate-200 bg-white shadow-md md:min-w-[18rem]">
          {loadError || hourGateCtrl.loadError ? (
            <p className="px-2.5 py-1.5 text-sm text-red-600">
              {loadError ?? hourGateCtrl.loadError}
            </p>
          ) : null}
          {omegaRawMode ? (
            <div className="border-b border-amber-300 bg-amber-50 px-2.5 py-2">
              <p className="text-xs font-semibold text-amber-800">
                OMEGA RAW MODE ACTIVE — direction, threshold &amp; window gates bypassed
              </p>
              <p className="text-xs text-amber-700">News filter &amp; circuit breaker always on</p>
            </div>
          ) : null}
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
                          onClick={() => void toggleDirectionMode()}
                          className={`inline-flex h-8 items-center justify-center border px-2 text-xs font-semibold max-md:min-h-[44px] ${
                            directionMode === 'auto'
                              ? 'border-blue-400 bg-blue-100 text-blue-800'
                              : 'border-slate-300 bg-slate-50 text-slate-600'
                          }`}
                          title={
                            directionMode === 'auto'
                              ? 'Auto mode — AMD sets direction at 10:05 UTC daily. Click to switch to manual.'
                              : 'Manual mode — you set direction. Click to switch to auto.'
                          }
                        >
                          <span className="md:hidden">{directionMode === 'auto' ? '⚡A' : '✋M'}</span>
                          <span className="hidden md:inline">{directionMode === 'auto' ? '⚡ AUTO' : '✋ MANUAL'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => (directionMode === 'manual' ? void flipOmega() : undefined)}
                          disabled={directionMode === 'auto' || omegaRawMode}
                          title={
                            omegaRawMode
                              ? 'Raw mode active — direction gate bypassed'
                              : directionMode === 'auto'
                                ? 'Auto mode active — direction set by AMD intelligence'
                                : undefined
                          }
                          className={`inline-flex h-8 min-w-[2.5rem] shrink-0 items-center justify-center border px-2 text-sm font-semibold max-md:min-h-[44px] md:min-w-[4.5rem] ${
                            omegaDir === 'long'
                              ? 'border-slate-200 bg-slate-100 text-slate-800'
                              : 'border-amber-300 bg-amber-100 text-amber-900'
                          }${directionMode === 'auto' || omegaRawMode ? ' opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <span className="md:hidden">{omegaDir === 'long' ? 'L' : 'S'}</span>
                          <span className="hidden md:inline">
                            {omegaDir === 'long' ? '↑ LONG' : '↓ SHORT'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleOmegaRawMode()}
                          title={
                            omegaRawMode
                              ? 'Raw mode ON — click to restore layer stack'
                              : 'Raw mode OFF — click to bypass direction/threshold/window gates'
                          }
                          className={`inline-flex h-8 min-w-[2.5rem] shrink-0 items-center justify-center border px-2 text-xs font-semibold max-md:min-h-[44px] md:min-w-[4rem] ${
                            omegaRawMode
                              ? 'border-amber-400 bg-amber-500 text-white'
                              : 'border-slate-200 bg-slate-100 text-slate-500'
                          }`}
                        >
                          <span className="md:hidden">{omegaRawMode ? 'R' : 'r'}</span>
                          <span className="hidden md:inline">{omegaRawMode ? 'RAW ●' : 'RAW ○'}</span>
                        </button>
                      </div>
                    ) : row.id === 'engine_rebuild' ? (
                      <div className="flex min-w-0 max-w-[11rem] flex-1 flex-wrap items-center justify-end gap-1.5 sm:max-w-none">
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
                        <RebuildHourGateSwitch
                          hourGateEnabled={hourGateCtrl.hourGateEnabled}
                          busy={hourGateCtrl.busy}
                          onToggle={() => void hourGateCtrl.toggleHourGate()}
                        />
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
          {toast || hourGateCtrl.toast ? (
            <p
              className="border-t border-slate-200 px-2.5 py-1.5 text-sm text-emerald-800"
              role="status"
            >
              {toast ?? hourGateCtrl.toast}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
