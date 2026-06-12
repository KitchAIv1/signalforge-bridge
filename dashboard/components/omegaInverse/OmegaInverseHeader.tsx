'use client';

import type { OmegaInverseStats } from '@/lib/omegaInverseTypes';

type HeaderProps = {
  stats: OmegaInverseStats;
};

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

export function OmegaInverseHeader({ stats }: HeaderProps) {
  return (
    <header className="mb-6 shrink-0">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Omega Inverse</h1>
      <p className="mt-1 text-sm text-slate-500">
        DTW-opposed execution · LONG→SHORT live · SHORT→LONG shadow only
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total live signals" value={String(stats.totalLiveSignals)} />
        <StatTile label="Executed live" value={String(stats.totalExecuted)} />
        <StatTile label="Shadow only" value={String(stats.totalShadow)} />
        <StatTile label="Blocked" value={String(stats.totalBlocked)} />
      </div>
    </header>
  );
}
