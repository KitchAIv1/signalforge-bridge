'use client';

import type { ReactNode } from 'react';
import type { AlphaOmegaStreakSnapshot } from '@/hooks/useAlphaOmegaLiveState';
import { AlphaOmegaStreakRadarBody } from '@/components/omegaPhase2/AlphaOmegaStreakRadarBody';

interface AlphaOmegaStreakRadarProps {
  streak: AlphaOmegaStreakSnapshot | null;
  isLoading: boolean;
  unarmedAgeOutEnabled: boolean;
}

export function AlphaOmegaStreakRadar({
  streak,
  isLoading,
  unarmedAgeOutEnabled,
}: AlphaOmegaStreakRadarProps) {
  if (isLoading && !streak) {
    return (
      <LiveCardShell title="Streak radar" ageOutEnabled={unarmedAgeOutEnabled}>
        Loading…
      </LiveCardShell>
    );
  }
  if (!streak) {
    return (
      <LiveCardShell title="Streak radar" ageOutEnabled={unarmedAgeOutEnabled}>
        <p className="text-sm text-slate-500">
          No streak state yet (migration / deploy pending).
        </p>
      </LiveCardShell>
    );
  }
  return (
    <LiveCardShell
      title="Streak radar"
      accent={streak.armed ? 'amber' : undefined}
      ageOutEnabled={unarmedAgeOutEnabled}
    >
      <AlphaOmegaStreakRadarBody
        streak={streak}
        unarmedAgeOutEnabled={unarmedAgeOutEnabled}
      />
    </LiveCardShell>
  );
}

function LiveCardShell({
  title,
  children,
  accent,
  ageOutEnabled,
}: {
  title: string;
  children: ReactNode;
  accent?: 'amber';
  ageOutEnabled: boolean;
}) {
  const borderClass =
    accent === 'amber'
      ? 'border-amber-500/50 bg-amber-500/5'
      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900';
  return (
    <section className={`rounded-lg border p-4 ${borderClass}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {title}
        </h2>
        <AgeOutStatusPill enabled={ageOutEnabled} />
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function AgeOutStatusPill({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
        enabled
          ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          : 'bg-amber-500/10 text-amber-800 dark:text-amber-200'
      }`}
      title="Unarmed age-out hygiene (>45m). Read-only; toggle via bridge_config."
    >
      Age-out {enabled ? 'ON' : 'OFF'}
    </span>
  );
}
