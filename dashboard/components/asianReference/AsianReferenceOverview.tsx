'use client';

import { EnumChip, SectionHeading } from '@/components/asianReference/AsianReferencePrimitives';

const OVERVIEW_CARDS = [
  {
    label: 'Purpose',
    value: 'Set omega_direction for the Asian session',
    detail: 'A session-level bias used by Omega infrastructure, not a standalone trade trigger.',
  },
  {
    label: 'Scope',
    value: 'AMD_SHIFTED only',
    detail: 'Non-shifted AMD days expire the direction window and are logged as skipped.',
  },
  {
    label: 'Run Window',
    value: '21:00 UTC -> 08:00 UTC',
    detail: 'The 21:00 set is valid until the next Asian session close at 08:00 UTC.',
  },
  {
    label: 'Close',
    value: 'Asian session exit sweep',
    detail: 'At 08:00 UTC the service closes open Omega positions and records ASIAN_CLOSE.',
  },
];

function OverviewCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
}

export function AsianReferenceOverview() {
  return (
    <section>
      <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-5 dark:border-sky-900/70 dark:from-sky-950/30 dark:via-slate-900 dark:to-indigo-950/20">
        <SectionHeading eyebrow="Reference" title="Asian Session Direction System">
          A concise operating guide for how the Activity page ASIAN panel should be read.
        </SectionHeading>
        <div className="mb-4 flex flex-wrap gap-2">
          <EnumChip tone="sky">omega_direction</EnumChip>
          <EnumChip tone="slate">asian_direction_log</EnumChip>
          <EnumChip tone="emerald">SET_LONG</EnumChip>
          <EnumChip tone="red">SET_SHORT</EnumChip>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {OVERVIEW_CARDS.map((overviewCard) => (
            <OverviewCard
              key={overviewCard.label}
              label={overviewCard.label}
              value={overviewCard.value}
              detail={overviewCard.detail}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
