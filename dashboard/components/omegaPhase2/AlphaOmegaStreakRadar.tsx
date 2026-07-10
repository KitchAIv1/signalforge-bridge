'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { AlphaOmegaStreakSnapshot } from '@/hooks/useAlphaOmegaLiveState';
import { AlphaOmegaStepRail } from '@/components/omegaPhase2/AlphaOmegaStepRail';
import {
  ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN,
  ALPHAOMEGA_ENTRY_STREAK_LENGTH,
} from '@/lib/omegaLaneBConstants';
import {
  directionToneClass,
  formatRelativeAge,
} from '@/lib/alphaOmegaLiveDisplay';
import {
  armWindowFillPercent,
  describeArmingStatus,
  minutesSinceIso,
  streakThresholdSlots,
} from '@/lib/alphaOmegaStreakDisplay';

interface AlphaOmegaStreakRadarProps {
  streak: AlphaOmegaStreakSnapshot | null;
  isLoading: boolean;
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
  const dirLabel = streak.currentStreakDirection?.toUpperCase() ?? '—';
  const streakAgeMin = minutesSinceIso(streak.currentStreakStartAt, nowMs);
  const { filledSlots, overflow } = streakThresholdSlots(length, ALPHAOMEGA_ENTRY_STREAK_LENGTH);
  const status = describeArmingStatus(streak, streakAgeMin);
  const railAccent = streak.armed ? 'amber' : status.tone === 'too_slow' ? 'rose' : 'sky';

  return (
    <>
      <StreakHeader dirLabel={dirLabel} length={length} badge={status.badge} armed={streak.armed} />
      <div className="mt-3">
        <AlphaOmegaStepRail
          filledSlots={filledSlots}
          totalSlots={ALPHAOMEGA_ENTRY_STREAK_LENGTH}
          overflow={overflow}
          accent={railAccent}
          label={`Streak ${filledSlots} of ${ALPHAOMEGA_ENTRY_STREAK_LENGTH}`}
        />
      </div>
      <ArmWindowMeter streakAgeMin={streakAgeMin} armed={streak.armed} tooSlow={status.tone === 'too_slow'} />
      {status.reason ? (
        <p
          className={`mt-2 text-xs ${
            status.tone === 'too_slow'
              ? 'text-rose-700 dark:text-rose-300'
              : status.tone === 'armed'
                ? 'text-amber-800 dark:text-amber-200'
                : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {status.reason}
        </p>
      ) : null}
      <StreakAgeMeta streak={streak} nowMs={nowMs} />
    </>
  );
}

function StreakHeader({
  dirLabel,
  length,
  badge,
  armed,
}: {
  dirLabel: string;
  length: number;
  badge: string;
  armed: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <p className={`text-2xl font-semibold tabular-nums ${directionToneClass(dirLabel)}`}>
        {dirLabel} · {length}/{ALPHAOMEGA_ENTRY_STREAK_LENGTH}
      </p>
      <span
        className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors duration-300 ${
          armed
            ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
        }`}
      >
        {badge}
      </span>
    </div>
  );
}

function ArmWindowMeter({
  streakAgeMin,
  armed,
  tooSlow,
}: {
  streakAgeMin: number | null;
  armed: boolean;
  tooSlow: boolean;
}) {
  const fill = armWindowFillPercent(streakAgeMin);
  const ageLabel = streakAgeMin != null ? `${streakAgeMin.toFixed(0)}m` : '—';
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-[11px] text-slate-500">
        <span>Arm window</span>
        <span className="tabular-nums">
          {ageLabel} / {ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN}m
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            armed ? 'bg-amber-500' : tooSlow ? 'bg-rose-500' : 'bg-sky-500'
          }`}
          style={{ width: `${fill}%` }}
        />
      </div>
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
