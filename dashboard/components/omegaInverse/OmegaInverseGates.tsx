'use client';

import { OMEGA_INVERSE_FORWARD_GATE } from '@/lib/omegaInverseConstants';
import type { OmegaInverseStats } from '@/lib/omegaInverseTypes';

type GatesProps = {
  stats: OmegaInverseStats;
};

function GateProgressBar({
  label,
  count,
  note,
}: {
  label: string;
  count: number;
  note?: string;
}) {
  const progressPct = Math.min(100, Math.round((count / OMEGA_INVERSE_FORWARD_GATE) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
        <span>{label}</span>
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {count} / {OMEGA_INVERSE_FORWARD_GATE}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-yellow-500 transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      {note ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{note}</p> : null}
    </div>
  );
}

export function OmegaInverseGates({ stats }: GatesProps) {
  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Forward gates</div>
      <GateProgressBar
        label="LONG→SHORT live executions"
        count={stats.longToShortCount}
      />
      <GateProgressBar
        label="SHORT→LONG shadow signals"
        count={stats.shortToLongCount}
        note="Shadow only — not yet validated for live"
      />
    </div>
  );
}
