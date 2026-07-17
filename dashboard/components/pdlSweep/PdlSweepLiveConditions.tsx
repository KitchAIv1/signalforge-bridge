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
  liveArmed: boolean;
  paused: boolean;
};

function resolveBanner(
  conditions: ConditionsMet | null,
  liveArmed: boolean,
  paused: boolean,
): { text: string; active: boolean; noTrade: boolean } {
  if (!conditions) {
    return { text: '— Awaiting today 12:10 UTC detection', active: false, noTrade: false };
  }
  const allFalse =
    !conditions.pdl_breach && !conditions.london_down && !conditions.h11_up;
  if (allFalse) {
    return { text: 'NO TRADE today — all three conditions false', active: false, noTrade: true };
  }
  if (paused) {
    return {
      text: 'LIVE LONG candidate — paused in Controls',
      active: false,
      noTrade: false,
    };
  }
  if (liveArmed) {
    return {
      text: 'LIVE LONG candidate — 12:00–15:00 · SL 20p',
      active: true,
      noTrade: false,
    };
  }
  return {
    text: 'Research: trade candidate (live engine off)',
    active: false,
    noTrade: false,
  };
}

export function PdlSweepLiveConditions({ todayRow, liveArmed, paused }: LivePanelProps) {
  const conditions = todayRow?.conditions_met as ConditionsMet | null;
  const depth = todayRow?.pdl_sweep_depth_pips;
  const london = todayRow?.london_net_pips;
  const h11 = todayRow?.h11_net_pips;
  const banner = resolveBanner(conditions, liveArmed, paused);

  const bannerClass = banner.noTrade
    ? 'rounded-md bg-slate-800 text-slate-200 px-4 py-3 text-sm font-semibold text-center'
    : banner.active
      ? 'rounded-md bg-emerald-700 text-white px-4 py-3 text-sm font-semibold text-center'
      : 'rounded-md bg-slate-100 text-slate-600 px-4 py-3 text-sm text-center dark:bg-slate-800 dark:text-slate-400';

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
      <div className={bannerClass}>{banner.text}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">
        AMD: {todayRow?.amd_outcome_tag ?? 'pending'} | AMD dir:{' '}
        {todayRow?.decision_auto_direction ?? '—'} | Live engine: pdl_window
        {paused ? ' (paused)' : liveArmed ? ' (armed)' : ' (off / waiting registration)'}
      </div>
    </div>
  );
}
