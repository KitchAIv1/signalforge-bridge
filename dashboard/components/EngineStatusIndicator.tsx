'use client';

import { useEffect, useState } from 'react';

interface EngineStatus {
  engineId: string;
  label: string;
  pair: string;
  isBlocked: boolean;
  reason: string;
  nextCleanHour: number | null;
  currentHourUtc: number;
}

const REBUILD_BLOCKED_HOURS = [0,1,2,3,4,5,6,7,9,10,14,15,19,20,21];
const OMEGA_BLOCKED_HOURS: number[] = []; // Omega has no hour block

function getRebuildStatus(hourUtc: number): EngineStatus {
  const isBlocked = REBUILD_BLOCKED_HOURS.includes(hourUtc);

  let nextClean: number | null = null;
  for (let i = 1; i <= 24; i++) {
    const h = (hourUtc + i) % 24;
    if (!REBUILD_BLOCKED_HOURS.includes(h)) {
      nextClean = h;
      break;
    }
  }

  const blockReasons: Record<number, string> = {
    0: 'Asian session',
    1: 'Asian session',
    2: 'Asian session',
    3: 'Asian session',
    4: 'Asian session',
    5: 'Asian session',
    6: 'Asian session',
    7: 'Pre-London spread',
    9: 'London open whipsaw',
    10: 'Confirmed negative edge',
    14: 'London close dead zone',
    15: 'London close dead zone',
    19: 'Late NY / Asian open',
    20: 'Late NY dead zone',
    21: 'Late NY dead zone',
  };

  return {
    engineId: 'engine_rebuild',
    label: 'Rebuild',
    pair: 'GBPUSD',
    isBlocked,
    reason: isBlocked
      ? blockReasons[hourUtc] ?? 'Hour blocked'
      : hourUtc === 13
        ? '⭐ Prime hour (56.7% TP, 1.5× size)'
        : 'Clean window',
    nextCleanHour: isBlocked ? nextClean : null,
    currentHourUtc: hourUtc,
  };
}

function getOmegaStatus(hourUtc: number): EngineStatus {
  const isWeekend = [0, 6].includes(new Date().getUTCDay());
  return {
    engineId: 'omega',
    label: 'Omega',
    pair: 'AUDUSD',
    isBlocked: isWeekend,
    reason: isWeekend
      ? 'Weekend — forex market closed'
      : 'Active — fires every M5',
    nextCleanHour: null,
    currentHourUtc: hourUtc,
  };
}

function StatusPill({ status }: { status: EngineStatus }) {
  const color = status.isBlocked
    ? 'bg-red-100 text-red-700 border-red-200'
    : status.reason.startsWith('⭐')
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-emerald-100 text-emerald-700 border-emerald-200';

  const dot = status.isBlocked ? '🔴' :
    status.reason.startsWith('⭐') ? '⭐' : '🟢';

  return (
    <span className={`
      inline-flex items-center gap-1 rounded border px-2 py-1 
      text-xs font-medium ${color}
    `}>
      {dot} {status.label}
    </span>
  );
}

export function EngineStatusIndicator() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const hourUtc = now.getUTCHours();
  const minuteUtc = now.getUTCMinutes();
  const timeStr = `${String(hourUtc).padStart(2,'0')}:${String(minuteUtc).padStart(2,'0')} UTC`;

  const rebuildStatus = getRebuildStatus(hourUtc);
  const omegaStatus = getOmegaStatus(hourUtc);

  const anyBlocked = rebuildStatus.isBlocked || omegaStatus.isBlocked;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`
          inline-flex items-center gap-2 rounded border px-2.5 py-1.5 
          text-xs font-medium transition-colors
          ${anyBlocked
            ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          }
        `}
        title="Engine filter status — click to expand"
      >
        <span>{anyBlocked ? '⚠️' : '✅'}</span>
        <span>Engines</span>
        <span className="text-slate-400">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              Engine Filter Status
            </span>
            <span className="text-xs text-slate-400">{timeStr}</span>
          </div>

          <div className="space-y-3">
            <div className="rounded border border-slate-100 bg-slate-50 p-2">
              <div className="mb-1 flex items-center justify-between">
                <StatusPill status={rebuildStatus} />
                <span className="text-xs text-slate-400">
                  {rebuildStatus.pair}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {rebuildStatus.isBlocked
                  ? `Blocked: ${rebuildStatus.reason}`
                  : rebuildStatus.reason}
              </p>
              {rebuildStatus.isBlocked &&
               rebuildStatus.nextCleanHour !== null && (
                <p className="mt-1 text-xs text-slate-400">
                  Next clean window: {String(rebuildStatus.nextCleanHour)
                    .padStart(2,'0')}:00 UTC
                </p>
              )}
            </div>

            <div className="rounded border border-slate-100 bg-slate-50 p-2">
              <div className="mb-1 flex items-center justify-between">
                <StatusPill status={omegaStatus} />
                <span className="text-xs text-slate-400">
                  {omegaStatus.pair}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {omegaStatus.reason}
              </p>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">
                Rebuild hour grid (UTC)
              </p>
              <div className="grid grid-cols-12 gap-0.5">
                {Array.from({ length: 24 }, (_, h) => {
                  const blocked = REBUILD_BLOCKED_HOURS.includes(h);
                  const current = h === hourUtc;
                  const prime = h === 13;
                  return (
                    <div
                      key={h}
                      title={`Hour ${h}:00 UTC — ${
                        blocked ? 'BLOCKED' : prime ? 'PRIME' : 'Active'
                      }`}
                      className={`
                        flex h-5 items-center justify-center rounded 
                        text-[9px] font-medium
                        ${current ? 'ring-1 ring-slate-800' : ''}
                        ${blocked
                          ? 'bg-red-200 text-red-700'
                          : prime
                            ? 'bg-amber-200 text-amber-700'
                            : 'bg-emerald-200 text-emerald-700'
                        }
                      `}
                    >
                      {h}
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex gap-2 text-[9px] text-slate-400">
                <span>🟥 Blocked</span>
                <span>🟨 Prime (13)</span>
                <span>🟩 Active</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 w-full text-center text-xs text-slate-400 
              hover:text-slate-600"
          >
            close
          </button>
        </div>
      )}
    </div>
  );
}
