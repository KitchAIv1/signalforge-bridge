'use client';

import type { ShadowTrailSummary } from '@/lib/shadowTrailTypes';

interface ShadowTrailSummaryCardsProps {
  summary: ShadowTrailSummary;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function ShadowTrailSummaryCards({ summary }: ShadowTrailSummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Live ratchet (legs sum)"
        value={`${summary.liveTotal.toFixed(1)}p`}
        hint={`${summary.rowCount} tp1 signals`}
      />
      <StatCard
        label="Shadow trail ungated"
        value={`${summary.shadowUngatedTotal.toFixed(1)}p`}
        hint={`${summary.filteredCount} passed filter`}
      />
      <StatCard
        label="Shadow trail sequenced"
        value={`${summary.shadowSequencedTotal.toFixed(1)}p`}
        hint={`${summary.sequencedExecuted} exec / ${summary.sequencedBlocked} blocked`}
      />
      <StatCard
        label="Delta (seq − live)"
        value={`${(summary.shadowSequencedTotal - summary.liveTotal).toFixed(1)}p`}
        hint="Same signals, different exit"
      />
    </div>
  );
}
