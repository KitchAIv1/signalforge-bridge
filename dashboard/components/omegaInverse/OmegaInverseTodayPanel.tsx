'use client';

import {
  deriveDtwDirection,
  formatDirectionLabel,
  formatUtcTime,
  isTodayUtc,
} from '@/lib/omegaInverseHelpers';
import type { LiveExecution, ShadowSignal } from '@/lib/omegaInverseTypes';

type TodayPanelProps = {
  liveExecutions: LiveExecution[];
  shadowSignals: ShadowSignal[];
  omegaDirection: 'long' | 'short' | null;
  validUntil: string | null;
};

type TodaySignalRow = {
  key: string;
  firedAt: string;
  dtwDirection: string;
  execDirection: string;
  statusLabel: string;
  statusClass: string;
  blockReason: string | null;
  pnlR: number | null;
};

function DirectionPill({ direction }: { direction: string }) {
  const isLong = direction.toLowerCase() === 'long';
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${
        isLong
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300'
      }`}
    >
      {formatDirectionLabel(direction)}
    </span>
  );
}

function buildTodayRows(
  liveExecutions: LiveExecution[],
  shadowSignals: ShadowSignal[],
): TodaySignalRow[] {
  const liveRows = liveExecutions
    .filter((row) => isTodayUtc(row.created_at))
    .map((row) => ({
      key: `live-${row.created_at}`,
      firedAt: row.created_at,
      dtwDirection: formatDirectionLabel(deriveDtwDirection(row.direction)),
      execDirection: formatDirectionLabel(row.direction),
      statusLabel: row.decision === 'EXECUTED' ? 'EXECUTED' : 'BLOCKED',
      statusClass:
        row.decision === 'EXECUTED'
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
      blockReason: row.block_reason,
      pnlR: row.pnl_r,
    }));

  const shadowRows = shadowSignals
    .filter((row) => isTodayUtc(row.fired_at))
    .map((row) => ({
      key: `shadow-${row.fired_at}`,
      firedAt: row.fired_at,
      dtwDirection: formatDirectionLabel(deriveDtwDirection(row.direction)),
      execDirection: formatDirectionLabel(row.direction),
      statusLabel: 'SHADOW',
      statusClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      blockReason: null,
      pnlR: null,
    }));

  return [...liveRows, ...shadowRows].sort(
    (left, right) => new Date(right.firedAt).getTime() - new Date(left.firedAt).getTime(),
  );
}

export function OmegaInverseTodayPanel({
  liveExecutions,
  shadowSignals,
  omegaDirection,
  validUntil,
}: TodayPanelProps) {
  const todayRows = buildTodayRows(liveExecutions, shadowSignals);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Today</h2>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-600 dark:text-slate-400">omega_direction</span>
          {omegaDirection ? <DirectionPill direction={omegaDirection} /> : <span>—</span>}
        </div>
        <div className="text-slate-600 dark:text-slate-400">
          Valid until: <span className="text-slate-900 dark:text-slate-100">{formatUtcTime(validUntil)} UTC</span>
        </div>
        <div className="rounded border border-amber-300/60 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
          SHORT→LONG inversion: shadow only — untested
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {todayRows.length === 0 ? (
          <p className="text-sm text-slate-500">No inverse activity today.</p>
        ) : (
          todayRows.map((row) => (
            <div
              key={row.key}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 py-2 text-sm last:border-b-0 dark:border-slate-800"
            >
              <span className="text-slate-500">{formatUtcTime(row.firedAt)}</span>
              <span>DTW {row.dtwDirection}</span>
              <span>→ {row.execDirection}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${row.statusClass}`}>
                {row.statusLabel}
              </span>
              {row.blockReason ? (
                <span className="text-xs text-red-600 dark:text-red-400">{row.blockReason}</span>
              ) : null}
              {row.pnlR != null ? (
                <span className="text-xs text-slate-600 dark:text-slate-400">{row.pnlR.toFixed(2)}R</span>
              ) : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
