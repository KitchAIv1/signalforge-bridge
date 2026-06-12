'use client';

import { AsianSessionShadowPill } from '@/components/asianSession/AsianSessionShadowPill';
import { AsianSessionDirectionPill } from '@/components/asianSession/AsianSessionDirectionPill';
import { ASIAN_FORWARD_GATE_DAYS } from '@/lib/asianSessionConstants';
import { countDistinctTradeDates } from '@/lib/asianSessionPageHelpers';
import type { AsianSessionDetection, D1ContextConfig } from '@/lib/directionDecisionTypes';

type PageHeaderProps = {
  rows: AsianSessionDetection[];
  firedRows: AsianSessionDetection[];
  d1Config: D1ContextConfig;
};

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</div>
      {detail ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</div> : null}
    </div>
  );
}

function TonightPriorBiasTile({ bias }: { bias: D1ContextConfig['asian_prior_direction_bias'] }) {
  if (bias === 'long' || bias === 'short') {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Tonight&apos;s Prior Bias
        </div>
        <div className="mt-2">
          <AsianSessionDirectionPill direction={bias} />
        </div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">From 21:10 UTC bridge_config</div>
      </div>
    );
  }
  const label = bias === 'neutral' ? 'NEUTRAL' : 'No bias';
  return (
    <StatTile
      label="Tonight's Prior Bias"
      value={label}
      detail="From 21:10 UTC bridge_config"
    />
  );
}

export function AsianSessionPageHeader({ rows, firedRows, d1Config }: PageHeaderProps) {
  const monitoredDays = countDistinctTradeDates(rows);
  const fireRatePct = monitoredDays > 0 ? Math.round((firedRows.length / monitoredDays) * 100) : 0;

  return (
    <header className="mb-6 shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Asian Session Detection
        </h1>
        <AsianSessionShadowPill />
      </div>
      <p className="mt-1 text-sm text-slate-500">00:00–08:00 UTC · AUD/USD · Conditions C → B → B_SLOW → A</p>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Days monitored" value={String(monitoredDays)} detail={`live: ${monitoredDays}`} />
        <StatTile
          label="Fires"
          value={`${firedRows.length} (${fireRatePct}%)`}
          detail={`Gate ${firedRows.length}/${ASIAN_FORWARD_GATE_DAYS}`}
        />
        <TonightPriorBiasTile bias={d1Config.asian_prior_direction_bias} />
        <StatTile label="LONG accuracy" value="Accumulating" detail="Outcome tracking pending" />
      </div>
    </header>
  );
}
