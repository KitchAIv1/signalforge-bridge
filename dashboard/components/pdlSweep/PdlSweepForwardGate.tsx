'use client';

import { FORWARD_GATE_DAYS } from '@/lib/pdlSweepConstants';

type ForwardGateProps = {
  firedCount: number;
  liveArmed: boolean;
};

export function PdlSweepForwardGate({ firedCount, liveArmed }: ForwardGateProps) {
  const progressPct = Math.min(100, Math.round((firedCount / FORWARD_GATE_DAYS) * 100));
  const cleared = firedCount >= FORWARD_GATE_DAYS;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
        <span>Research cohort progress (3/3 fires)</span>
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {firedCount} / {FORWARD_GATE_DAYS} fired days
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-all ${cleared ? 'bg-emerald-500' : 'bg-yellow-500'}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {liveArmed
          ? 'Live execution is controlled by PDL_WINDOW_ENABLED + Activity Controls pause — not by this research bar.'
          : 'Research tracking only. Live execution requires PDL_WINDOW_ENABLED=true on the bridge.'}
      </p>
    </div>
  );
}
