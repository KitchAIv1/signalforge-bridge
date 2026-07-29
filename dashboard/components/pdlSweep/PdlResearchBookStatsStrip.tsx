'use client';

import { computePdlResearchBookStats } from '@/lib/pdlResearchBookStats';
import type { PdlSweepSignalRow } from '@/lib/pdlSweepTypes';

type StatsStripProps = {
  rows: PdlSweepSignalRow[];
};

function formatSignedPips(value: number | null): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}p`;
}

function pipToneClass(value: number | null): string {
  if (value == null || value === 0) return 'text-slate-700 dark:text-slate-200';
  return value > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-rose-600 dark:text-rose-400';
}

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
};

function StatCard({ label, value, hint, valueClassName }: StatCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/80">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${valueClassName ?? 'text-slate-800 dark:text-slate-100'}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

/** Mini research-book summary — same H12−1.5 rule as the history table. */
export function PdlResearchBookStatsStrip({ rows }: StatsStripProps) {
  const stats = computePdlResearchBookStats(rows);
  const winRate =
    stats.winRatePct == null ? '—' : `${stats.winRatePct}%`;

  return (
    <section aria-label="Research book summary">
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">
        Research book summary
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Total PnL"
          value={formatSignedPips(stats.totalNetPips)}
          hint={`${stats.evaluatedDays} evaluated days`}
          valueClassName={pipToneClass(stats.totalNetPips)}
        />
        <StatCard
          label="Win rate"
          value={winRate}
          hint={`${stats.wins}W / ${stats.losses}L / ${stats.breakevens}BE`}
        />
        <StatCard
          label="Max DD"
          value={stats.evaluatedDays === 0 ? '—' : `−${stats.maxDrawdownPips}p`}
          hint="Peak-to-trough"
          valueClassName={
            stats.maxDrawdownPips > 0
              ? 'text-rose-600 dark:text-rose-400'
              : undefined
          }
        />
        <StatCard
          label="Avg / day"
          value={formatSignedPips(stats.avgNetPips)}
          valueClassName={pipToneClass(stats.avgNetPips)}
        />
        <StatCard
          label="Best day"
          value={formatSignedPips(stats.bestDayPips)}
          valueClassName={pipToneClass(stats.bestDayPips)}
        />
        <StatCard
          label="Worst day"
          value={formatSignedPips(stats.worstDayPips)}
          valueClassName={pipToneClass(stats.worstDayPips)}
        />
      </div>
    </section>
  );
}
