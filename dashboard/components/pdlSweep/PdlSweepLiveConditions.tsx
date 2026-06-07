'use client';

import type { ConditionsMet, PdlSweepSignalRow } from '@/lib/pdlSweepTypes';

type PillProps = {
  label: string;
  met: boolean | undefined;
  value: string;
};

function ConditionPill({ label, met, value }: PillProps) {
  const status = met == null ? '—' : met ? '✓' : '✗';
  const color = met == null
    ? 'text-slate-400 border-slate-200 dark:border-slate-700'
    : met
      ? 'text-green-600 border-green-200 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-900/20'
      : 'text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-900/20';

  return (
    <div className={`rounded-lg border px-4 py-3 text-center min-w-[140px] ${color}`}>
      <div className="text-xs font-medium uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold mt-1">{status}</div>
      <div className="text-xs mt-1 text-slate-500 dark:text-slate-400">{value}</div>
    </div>
  );
}

type LivePanelProps = {
  todayRow: PdlSweepSignalRow | null;
};

export function PdlSweepLiveConditions({ todayRow }: LivePanelProps) {
  const conditions = todayRow?.conditions_met as ConditionsMet | null;
  const allMet = conditions?.pdl_breach && conditions?.london_down && conditions?.h11_up;

  const depth = todayRow?.pdl_sweep_depth_pips;
  const london = todayRow?.london_net_pips;
  const h11 = todayRow?.h11_net_pips;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        Live conditions (today UTC)
      </div>
      <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
        <ConditionPill
          label="PDL breach"
          met={conditions?.pdl_breach}
          value={depth != null ? `${depth}p below` : '—'}
        />
        <ConditionPill
          label="London down"
          met={conditions?.london_down}
          value={london != null ? `${london}p` : '—'}
        />
        <ConditionPill
          label="H11 up"
          met={conditions?.h11_up}
          value={h11 != null ? `${h11}p` : '—'}
        />
      </div>
      <div
        className={
          allMet
            ? 'rounded-md bg-red-600 text-white px-4 py-3 text-sm font-semibold text-center'
            : 'rounded-md bg-slate-100 text-slate-600 px-4 py-3 text-sm text-center dark:bg-slate-800 dark:text-slate-400'
        }
      >
        {allMet
          ? 'SIGNAL ACTIVE — Predicted LONG 12:00–13:00'
          : '— No signal today'}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">
        AMD: {todayRow?.amd_outcome_tag ?? 'pending'} | Engine:{' '}
        {todayRow?.decision_auto_direction ?? '—'}
      </div>
    </div>
  );
}
