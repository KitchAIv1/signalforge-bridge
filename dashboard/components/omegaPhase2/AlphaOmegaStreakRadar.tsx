'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { AlphaOmegaStreakSnapshot } from '@/hooks/useAlphaOmegaLiveState';
import { ALPHAOMEGA_ENTRY_STREAK_LENGTH } from '@/lib/omegaLaneBConstants';
import {
  directionToneClass,
  formatRelativeAge,
  meterFillPercent,
} from '@/lib/alphaOmegaLiveDisplay';

interface AlphaOmegaStreakRadarProps {
  streak: AlphaOmegaStreakSnapshot | null;
  isLoading: boolean;
}

function armingLabel(streak: AlphaOmegaStreakSnapshot): string {
  if (streak.armed && streak.armedDirection) {
    return `ARMED for ${streak.armedDirection.toUpperCase()}`;
  }
  if (streak.currentStreakLength > 0) return 'Arming';
  return 'Idle';
}

export function AlphaOmegaStreakRadar({ streak, isLoading }: AlphaOmegaStreakRadarProps) {
  if (isLoading && !streak) {
    return <LiveCardShell title="Streak radar">Loading…</LiveCardShell>;
  }
  if (!streak) {
    return (
      <LiveCardShell title="Streak radar">
        <p className="text-sm text-slate-500">No streak state yet (migration / deploy pending).</p>
      </LiveCardShell>
    );
  }
  return (
    <LiveCardShell title="Streak radar" accent={streak.armed ? 'amber' : undefined}>
      <StreakRadarBody streak={streak} />
    </LiveCardShell>
  );
}

function StreakRadarBody({ streak }: { streak: AlphaOmegaStreakSnapshot }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const tickId = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(tickId);
  }, []);
  const length = streak.currentStreakLength;
  const fill = meterFillPercent(length, ALPHAOMEGA_ENTRY_STREAK_LENGTH);
  const dirLabel = streak.currentStreakDirection?.toUpperCase() ?? '—';
  return (
    <>
      <StreakHeader streak={streak} dirLabel={dirLabel} length={length} />
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            streak.armed ? 'bg-amber-500' : 'bg-sky-500'
          }`}
          style={{ width: `${fill}%` }}
        />
      </div>
      <StreakAgeMeta streak={streak} nowMs={nowMs} />
    </>
  );
}

function StreakHeader({
  streak,
  dirLabel,
  length,
}: {
  streak: AlphaOmegaStreakSnapshot;
  dirLabel: string;
  length: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <p className={`text-2xl font-semibold tabular-nums ${directionToneClass(dirLabel)}`}>
        {dirLabel} · {length}/{ALPHAOMEGA_ENTRY_STREAK_LENGTH}
      </p>
      <span
        className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
          streak.armed
            ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
        }`}
      >
        {armingLabel(streak)}
      </span>
    </div>
  );
}

function StreakAgeMeta({
  streak,
  nowMs,
}: {
  streak: AlphaOmegaStreakSnapshot;
  nowMs: number;
}) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
      <div>
        <dt>Last fire</dt>
        <dd className="text-slate-800 dark:text-slate-200">
          {formatRelativeAge(streak.lastFireAt, nowMs)}
        </dd>
      </div>
      <div>
        <dt>Streak age</dt>
        <dd className="text-slate-800 dark:text-slate-200">
          {formatRelativeAge(streak.currentStreakStartAt, nowMs)}
        </dd>
      </div>
    </dl>
  );
}

function LiveCardShell({
  title,
  children,
  accent,
}: {
  title: string;
  children: ReactNode;
  accent?: 'amber';
}) {
  const borderClass =
    accent === 'amber'
      ? 'border-amber-500/50 bg-amber-500/5'
      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900';
  return (
    <section className={`rounded-lg border p-4 ${borderClass}`}>
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
