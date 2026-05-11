'use client';

import { useEffect, useState } from 'react';
import { REBUILD_BLOCKED_HOURS_UTC } from '@/lib/rebuildHourBlockedHoursUtc';

interface EngineStatus {
  engineId: string;
  label: string;
  pair: string;
  isBlocked: boolean;
  reason: string;
  nextCleanHour: number | null;
  currentHourUtc: number;
}

interface EngineStatusIndicatorProps {
  omegaDir?: 'long' | 'short';
  rebuildHourGateEnabled?: boolean;
}

// Omega: bridge no longer applies UTC hour gates; UI shows advisory/active only (weekend still closed).

const REBUILD_BLOCK_REASONS: Record<number, string> = {
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
// Hours 0-14, 21-23 are active (Asian/London/Overlap)

function nextCleanRebuildHourUtc(
  hourUtc: number,
  hourGateEnabled: boolean
): number | null {
  if (!hourGateEnabled) return null;
  if (!REBUILD_BLOCKED_HOURS_UTC.includes(hourUtc)) return null;
  for (let i = 1; i <= 24; i++) {
    const h = (hourUtc + i) % 24;
    if (!REBUILD_BLOCKED_HOURS_UTC.includes(h)) return h;
  }
  return null;
}

function getRebuildStatus(
  hourUtc: number,
  hourGateEnabled: boolean
): EngineStatus {
  const inBlockedList =
    REBUILD_BLOCKED_HOURS_UTC.includes(hourUtc);
  const isBlocked = hourGateEnabled && inBlockedList;
  const nextCleanHour = nextCleanRebuildHourUtc(hourUtc, hourGateEnabled);

  let reason: string;
  if (isBlocked) {
    reason =
      REBUILD_BLOCK_REASONS[hourUtc] ?? 'Hour blocked';
  } else if (!hourGateEnabled && inBlockedList) {
    reason = 'Hour filter OFF — bridge will not UTC-block this hour';
  } else if (hourUtc === 13) {
    reason = '⭐ Prime hour (56.7% TP, 1.5× size)';
  } else {
    reason = 'Clean window';
  }

  return {
    engineId: 'engine_rebuild',
    label: 'Rebuild',
    pair: 'GBPUSD',
    isBlocked,
    reason,
    nextCleanHour,
    currentHourUtc: hourUtc,
  };
}

function getOmegaStatus(
  hourUtc: number,
  dir: 'long' | 'short'
): EngineStatus {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon...6=Sat
  const hourUTC = now.getUTCHours();
  const minuteUTC = now.getUTCMinutes();
  const timeDecimal = hourUTC + minuteUTC / 60;
  const dirLabel = dir === 'long' ? '↑ LONG' : '↓ SHORT';

  // Forex market hours:
  // Opens:  Sunday 21:00 UTC (Sydney/Asian open)
  // Closes: Friday 21:00 UTC
  const isWeekend =
    day === 6 ||
    (day === 0 && timeDecimal < 21) ||
    (day === 5 && timeDecimal >= 21);

  if (isWeekend) {
    return {
      engineId: 'omega',
      label: 'Omega',
      pair: 'AUDUSD',
      isBlocked: true,
      reason: 'Weekend — forex market closed',
      nextCleanHour: null,
      currentHourUtc: hourUtc,
    };
  }

  return {
    engineId: 'omega',
    label: 'Omega',
    pair: 'AUDUSD',
    isBlocked: false,
    reason: `Active ${dirLabel} — fires every M5`,
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

export function EngineStatusIndicator({
  omegaDir = 'long',
  rebuildHourGateEnabled = true,
}: EngineStatusIndicatorProps) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const hourUtc = now.getUTCHours();
  const minuteUtc = now.getUTCMinutes();
  const timeStr = `${String(hourUtc).padStart(2,'0')}:${String(minuteUtc).padStart(2,'0')} UTC`;

  const rebuildStatus = getRebuildStatus(hourUtc, rebuildHourGateEnabled);
  const omegaStatus = getOmegaStatus(hourUtc, omegaDir);

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
              {omegaStatus.isBlocked && omegaStatus.nextCleanHour !== null && (
                <p className="mt-1 text-xs text-slate-400">
                  Next active window: {String(omegaStatus.nextCleanHour)
                    .padStart(2,'0')}:00 UTC
                </p>
              )}
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">
                Omega (UTC grid — informational)
              </p>
              <p className="mb-1 text-[9px] text-slate-500">
                Bridge does not block Omega by UTC hour; regime is advisory only.
              </p>
              <div className="grid grid-cols-12 gap-0.5">
                {Array.from({ length: 24 }, (_, h) => {
                  const current = h === hourUtc;
                  return (
                    <div
                      key={h}
                      title={`Hour ${h}:00 UTC — not blocked at bridge`}
                      className={`
                        flex h-5 items-center justify-center rounded
                        text-[9px] font-medium
                        ${current ? 'ring-1 ring-slate-800' : ''}
                        bg-emerald-200 text-emerald-700
                      `}
                    >
                      {h}
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex gap-2 text-[9px] text-slate-400">
                <span>🟩 All hours eligible (market open)</span>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">
                Rebuild hour grid (UTC)
              </p>
              <div className="grid grid-cols-12 gap-0.5">
                {Array.from({ length: 24 }, (_, h) => {
                  const wouldBlockIfGateOn =
                    REBUILD_BLOCKED_HOURS_UTC.includes(h);
                  const blocked =
                    rebuildHourGateEnabled && wouldBlockIfGateOn;
                  const current = h === hourUtc;
                  const prime = h === 13;
                  const hourTitle =
                    blocked
                      ? 'BLOCKED (hour filter ON)'
                      : !rebuildHourGateEnabled &&
                          wouldBlockIfGateOn
                        ? 'Hour filter OFF — would block at bridge if ON'
                        : prime
                          ? 'PRIME'
                          : 'Active';
                  return (
                    <div
                      key={h}
                      title={`Hour ${h}:00 UTC — ${hourTitle}`}
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
              {!rebuildHourGateEnabled ? (
                <p className="mt-1 text-[9px] font-medium text-amber-700">
                  Rebuild UTC hour filter is OFF at bridge — grid shows green
                  for hours that would block if turned ON.
                </p>
              ) : null}
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
