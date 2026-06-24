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

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</p>
  );
}

export function ShadowTrailSummaryCards({ summary }: ShadowTrailSummaryCardsProps) {
  const seqDelta = summary.shadowSequencedTotal - summary.liveTotal;
  const optSeqDelta = summary.shadowOptSequencedTotal - summary.liveTotal;
  const optVsBaseline = summary.shadowOptSequencedTotal - summary.shadowSequencedTotal;

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel>Baseline — SL 1.5R / trail 0.5R</SectionLabel>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Live ratchet (legs sum)"
          value={`${summary.liveTotal.toFixed(1)}p`}
          hint={`${summary.rowCount} tp1 signals`}
        />
        <StatCard
          label="Shadow ungated"
          value={`${summary.shadowUngatedTotal.toFixed(1)}p`}
          hint={`${summary.filteredCount} passed filter`}
        />
        <StatCard
          label="Shadow sequenced"
          value={`${summary.shadowSequencedTotal.toFixed(1)}p`}
          hint={`${summary.sequencedExecuted} exec / ${summary.sequencedBlocked} blocked`}
        />
        <StatCard
          label="Delta (seq − live)"
          value={`${seqDelta.toFixed(1)}p`}
          hint="Baseline sequenced vs live"
        />
      </div>

      <SectionLabel>Optimized — SHORT 2.0R / LONG 3.0R / trail 0.5R</SectionLabel>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Opt shadow ungated"
          value={`${summary.shadowOptUngatedTotal.toFixed(1)}p`}
          hint="Same signals, wider direction SL"
        />
        <StatCard
          label="Opt shadow sequenced"
          value={`${summary.shadowOptSequencedTotal.toFixed(1)}p`}
          hint={`${summary.sequencedOptExecuted} exec / ${summary.sequencedOptBlocked} blocked`}
        />
        <StatCard
          label="Opt seq − live"
          value={`${optSeqDelta.toFixed(1)}p`}
          hint="Optimized sequenced vs live ratchet"
        />
        <StatCard
          label="Opt seq − baseline seq"
          value={`${optVsBaseline >= 0 ? '+' : ''}${optVsBaseline.toFixed(1)}p`}
          hint="Research uplift vs 1.5R lane"
        />
      </div>
    </div>
  );
}
