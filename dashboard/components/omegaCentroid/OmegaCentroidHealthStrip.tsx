'use client';

import type { OmegaCentroidHealthStats } from '@/lib/omegaCentroidHealthStats';
import {
  formatDistance,
  formatSharePct,
} from '@/lib/omegaCentroidHealthStats';

interface OmegaCentroidHealthStripProps {
  stats: OmegaCentroidHealthStats | null;
  isLoading: boolean;
}

export function OmegaCentroidHealthStrip({
  stats,
  isLoading,
}: OmegaCentroidHealthStripProps) {
  if (isLoading && !stats) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-slate-500">Loading fire telemetry…</p>
      </section>
    );
  }
  if (!stats) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-slate-500">No health stats yet.</p>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Fire telemetry (matched shadows only)
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Fires 7d" value={String(stats.fireCount7d)} />
        <StatCard label="Fires 30d" value={String(stats.fireCount30d)} />
        <StatCard
          label="Hours since last"
          value={
            stats.hoursSinceLastFire != null
              ? stats.hoursSinceLastFire.toFixed(1)
              : '—'
          }
        />
        <StatCard
          label="Sample n"
          value={String(stats.sampleCount)}
          hint="Last 30d · capped"
        />
        <StatCard label="Avg distance" value={formatDistance(stats.avgDistance)} />
        <StatCard label="p50 distance" value={formatDistance(stats.p50Distance)} />
        <StatCard label="p90 distance" value={formatDistance(stats.p90Distance)} />
        <StatCard
          label="Near ceiling"
          value={formatSharePct(stats.shareNearCeiling)}
          hint={`≥90% of thr ${stats.thresholdUsed.toFixed(2)}`}
        />
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        Comfortable share (&lt;50% of thr): {formatSharePct(stats.shareComfortable)}.
        This is not full match-rate — non-matches are never written to
        omega_shadow_signals.
      </p>
    </section>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p> : null}
    </div>
  );
}
