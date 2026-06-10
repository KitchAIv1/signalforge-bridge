'use client';

import { ASIAN_FORWARD_GATE_DAYS } from '@/lib/asianSessionConstants';
import type { AsianSessionDetection } from '@/lib/directionDecisionTypes';

type ForwardGateProps = {
  firedRows: AsianSessionDetection[];
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
  const progressPct = Math.min(100, Math.round((count / ASIAN_FORWARD_GATE_DAYS) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
        <span>{label}</span>
        <span className="font-medium text-slate-900 dark:text-slate-100">
          {count} / {ASIAN_FORWARD_GATE_DAYS}
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

export function AsianSessionForwardGate({ firedRows }: ForwardGateProps) {
  const highCount = firedRows.filter((row) => row.confidence_tier === 'HIGH').length;
  const lowCount = firedRows.filter((row) => row.confidence_tier === 'LOW').length;
  const unclassifiedCount = firedRows.filter((row) => row.confidence_tier == null).length;
  const longCount = firedRows.filter((row) => row.direction_set === 'long').length;
  const shortCount = firedRows.filter((row) => row.direction_set === 'short').length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4 dark:border-slate-700 dark:bg-slate-900">
      <div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Forward gate — confidence tier sizing
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          30 HIGH confidence fires needed before wiring HIGH → 1.0× size · 30 LOW confidence fires
          before wiring LOW → 0.5× size
        </p>
      </div>
      <GateProgressBar label="HIGH fires" count={highCount} />
      <GateProgressBar label="LOW fires" count={lowCount} />
      <GateProgressBar
        label="Total fires"
        count={firedRows.length}
        note={
          unclassifiedCount > 0
            ? `${unclassifiedCount} unclassified (pre-confidence stack)`
            : undefined
        }
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">
        SHORT fires: {shortCount} · LONG fires: {longCount}
      </p>
    </div>
  );
}
