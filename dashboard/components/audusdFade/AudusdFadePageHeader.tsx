'use client';

import type { AudusdFadeStats } from '@/lib/audusdFadeTypes';
import { AUDUSD_FADE_MAX_TRADES_DAY } from '@/lib/audusdFadeConstants';

type PageHeaderProps = {
  stats: AudusdFadeStats;
};

export function AudusdFadePageHeader({ stats }: PageHeaderProps) {
  const netPipsClass =
    stats.netPips > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : stats.netPips < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-900 dark:text-slate-100';

  return (
    <header className="mb-6 shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          AUDUSD Fade
        </h1>
        <span className="rounded px-2 py-0.5 text-xs font-semibold text-sky-800 bg-sky-100 dark:text-sky-200 dark:bg-sky-900/40">
          PAPER
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        EURUSD-gated SMA50 mean-reversion — |close − SMA50| ≥ 30p · T10/S15 · max{' '}
        {AUDUSD_FADE_MAX_TRADES_DAY}/day
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-600 dark:text-slate-400 lg:grid-cols-4">
        <span>
          Total trades:{' '}
          <strong className="text-slate-900 dark:text-slate-100">{stats.totalTrades}</strong>
        </span>
        <span>
          Win rate:{' '}
          <strong className="text-slate-900 dark:text-slate-100">{stats.winRateLabel}</strong>
        </span>
        <span>
          Net pips:{' '}
          <strong className={netPipsClass}>{stats.netPips >= 0 ? '+' : ''}{stats.netPips}p</strong>
        </span>
        <span>
          Today:{' '}
          <strong className="text-slate-900 dark:text-slate-100">
            {stats.todayTradeCount}/{AUDUSD_FADE_MAX_TRADES_DAY}
          </strong>
        </span>
      </div>
    </header>
  );
}
