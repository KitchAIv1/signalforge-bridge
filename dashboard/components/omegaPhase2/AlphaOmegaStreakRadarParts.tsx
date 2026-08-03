'use client';

import type { AlphaOmegaStreakSnapshot } from '@/hooks/useAlphaOmegaLiveState';
import { ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN, ALPHAOMEGA_ENTRY_STREAK_LENGTH } from '@/lib/omegaLaneBConstants';
import { directionToneClass, formatRelativeAge } from '@/lib/alphaOmegaLiveDisplay';
import { armWindowFillPercent } from '@/lib/alphaOmegaStreakDisplay';
import type { StreakRadarTone } from '@/lib/alphaOmegaUnarmedAgeOutDisplay';

export function StreakRadarHeader({
  dirLabel,
  length,
  badge,
  tone,
  armed,
}: {
  dirLabel: string;
  length: number;
  badge: string;
  tone: StreakRadarTone;
  armed: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <p className={`text-2xl font-semibold tabular-nums ${directionToneClass(dirLabel)}`}>
        {dirLabel} · {length}/{ALPHAOMEGA_ENTRY_STREAK_LENGTH}
      </p>
      <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${badgeClass(tone, armed)}`}>
        {badge}
      </span>
    </div>
  );
}

function badgeClass(tone: StreakRadarTone, armed: boolean): string {
  if (armed) return 'bg-amber-500/20 text-amber-800 dark:text-amber-200';
  if (tone === 'reset_pending') {
    return 'bg-rose-500/15 text-rose-800 dark:text-rose-200';
  }
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

export function StreakArmWindowMeter({
  foundingMin,
  armed,
  alert,
}: {
  foundingMin: number | null;
  armed: boolean;
  alert: boolean;
}) {
  const fill = armWindowFillPercent(foundingMin);
  const ageLabel = foundingMin != null ? `${foundingMin.toFixed(0)}m` : '—';
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-[11px] text-slate-500">
        <span>Founding span (start→last fire · arm)</span>
        <span className="tabular-nums">
          {ageLabel} / {ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN}m
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            armed ? 'bg-amber-500' : alert ? 'bg-rose-500' : 'bg-sky-500'
          }`}
          style={{ width: `${fill}%` }}
        />
      </div>
    </div>
  );
}

export function StreakRadarAgeMeta({
  streak,
  nowMs,
  wallAgeMin,
  showResetHint,
  resetPending,
}: {
  streak: AlphaOmegaStreakSnapshot;
  nowMs: number;
  wallAgeMin: number | null;
  showResetHint: boolean;
  resetPending: boolean;
}) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
      <div>
        <dt>Last fire</dt>
        <dd className="text-slate-800 dark:text-slate-200">
          {formatRelativeAge(streak.lastFireAt, nowMs)}
        </dd>
      </div>
      <WallAgeCell
        streakStartAt={streak.currentStreakStartAt}
        nowMs={nowMs}
        wallAgeMin={wallAgeMin}
        showResetHint={showResetHint}
        resetPending={resetPending}
      />
    </dl>
  );
}

function WallAgeCell({
  streakStartAt,
  nowMs,
  wallAgeMin,
  showResetHint,
  resetPending,
}: {
  streakStartAt: string | null;
  nowMs: number;
  wallAgeMin: number | null;
  showResetHint: boolean;
  resetPending: boolean;
}) {
  const wallLabel =
    wallAgeMin != null
      ? `${wallAgeMin.toFixed(0)}m`
      : formatRelativeAge(streakStartAt, nowMs);
  return (
    <div>
      <dt>Wall age (start→now)</dt>
      <dd
        className={
          resetPending
            ? 'text-rose-800 dark:text-rose-200'
            : 'text-slate-800 dark:text-slate-200'
        }
      >
        {wallLabel}
        {showResetHint ? <WallAgeResetHint resetPending={resetPending} /> : null}
      </dd>
    </div>
  );
}

function WallAgeResetHint({ resetPending }: { resetPending: boolean }) {
  return (
    <span className="mt-0.5 block text-[10px] font-normal text-slate-500 dark:text-slate-400">
      {resetPending
        ? 'Reset if still unarmed at next fire'
        : `Reset if unarmed past ${ALPHAOMEGA_ENTRY_SPEED_CEILING_MIN}m`}
    </span>
  );
}

export function streakReasonToneClass(tone: StreakRadarTone): string {
  if (tone === 'too_slow' || tone === 'reset_pending') {
    return 'text-rose-700 dark:text-rose-300';
  }
  if (tone === 'armed') return 'text-amber-800 dark:text-amber-200';
  return 'text-slate-500 dark:text-slate-400';
}
