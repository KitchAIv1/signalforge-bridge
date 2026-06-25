'use client';

import { useAsianSessionDetection } from '@/hooks/useAsianSessionDetection';
import { AmdPanel } from '@/components/AmdPanel';
import { AsianSessionForwardGate } from '@/components/asianSession/AsianSessionForwardGate';
import { AsianSessionHistoryTable } from '@/components/asianSession/AsianSessionHistoryTable';
import { AsianSessionPageHeader } from '@/components/asianSession/AsianSessionPageHeader';
import { AsianSessionTodayPanel } from '@/components/asianSession/AsianSessionTodayPanel';

export default function AsianSessionPage() {
  const { rows, todayRow, todayChecks, firedRows, noFireDays, d1Config, omegaWindow, loading, error } =
    useAsianSessionDetection();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-400">Loading Asian session detection...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-white p-4 dark:bg-slate-950 sm:p-6">
      <AsianSessionPageHeader rows={rows} firedRows={firedRows} d1Config={d1Config} omegaWindow={omegaWindow} />

      <div className="flex flex-col gap-6">
        <AsianSessionForwardGate firedRows={firedRows} />

        <section className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
            <p className="font-medium text-slate-900 dark:text-slate-100">What this is</p>
            <p className="mt-2">
              Asian Shape measures the price path within the 00:00–08:00 UTC Asian session — specifically
              whether price reversed direction (a &quot;V,&quot; &quot;check,&quot; or &quot;inverted-check&quot; shape)
              rather than trending cleanly. This was investigated on June 16, 2026 after a missed reversal trade.
              A backtest across 292 historical days found no reliable correlation between Asian shape and what
              the AMD distribution window (10:30–14:00 UTC) does afterward — so this field does{' '}
              <strong>not</strong> influence any trading decision today. It is logged here so the relationship
              can be re-evaluated as more live history accumulates.
            </p>
          </div>
          <AmdPanel compact />
        </section>

        <AsianSessionTodayPanel todayChecks={todayChecks} todayRow={todayRow} d1Config={d1Config} />

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
            Signal history
          </h2>
          <AsianSessionHistoryTable firedRows={firedRows} noFireDays={noFireDays} rows={rows} />
        </section>
      </div>
    </div>
  );
}
