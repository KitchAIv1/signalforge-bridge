'use client';

import { EnumChip, SectionHeading } from '@/components/omegaExitReference/OmegaExitReferencePrimitives';

const OVERVIEW_CARDS = [
  {
    label: 'Purpose',
    value: 'Bridge-side exit for omega engine',
    detail:
      'No OANDA SL/TP on fill. Exits run through trail_stop_state, session sweeps, direction flips, and max_hold.',
  },
  {
    label: 'Primary Pair',
    value: 'AUD_USD (Omega signals)',
    detail:
      'Trail monitor uses M5 candles + live mid. engine_amd distribution is a separate pip-trail pipeline on the same pair.',
  },
  {
    label: 'Trail Lock',
    value: '0.5R (Omega-specific)',
    detail:
      'Tighter than Charlie (1.5R). SL distance = 1.5R before/after activation. R = |fill_price - mirrored_stop_loss|.',
  },
  {
    label: 'Close Reasons',
    value: '5 production paths',
    detail:
      'trail_stop, trail_sl_hit, direction_flip_auto_close, max_hold, plus OANDA external close (no reason set).',
  },
] as const;

function OverviewCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
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

export function OmegaExitReferenceOverview() {
  return (
    <section>
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 p-5 dark:border-violet-900/70 dark:from-violet-950/30 dark:via-slate-900 dark:to-indigo-950/20">
        <SectionHeading eyebrow="Reference" title="Omega Exit Strategy on BRIDGE">
          How open Omega positions are protected, closed, and reconciled — tied to Asian session windows
          and AMD distribution timing.
        </SectionHeading>
        <div className="mb-4 flex flex-wrap gap-2">
          <EnumChip tone="violet">omega</EnumChip>
          <EnumChip tone="slate">trail_stop_state</EnumChip>
          <EnumChip tone="emerald">trail_stop</EnumChip>
          <EnumChip tone="red">trail_sl_hit</EnumChip>
          <EnumChip tone="amber">direction_flip_auto_close</EnumChip>
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
