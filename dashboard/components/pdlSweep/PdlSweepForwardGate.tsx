'use client';

import { FORWARD_GATE_DAYS } from '@/lib/pdlSweepConstants';

type ForwardGateProps = {
  firedCount: number;
};

export function PdlSweepForwardGate({ firedCount }: ForwardGateProps) {
  const progressPct = Math.min(100, Math.round((firedCount / FORWARD_GATE_DAYS) * 100));

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
        <span>Forward validation gate</span>
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {firedCount} / {FORWARD_GATE_DAYS} fired days
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-yellow-500 transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Research cohort: 12 fired days at 75% h12 UP. No execution impact until gate clears.
      </p>
    </div>
  );
}
