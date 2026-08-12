'use client';

import { PeakFadeHistoryTable } from '@/components/peakFade/PeakFadeHistoryTable';
import { PeakFadePageHeader } from '@/components/peakFade/PeakFadePageHeader';
import { PeakFadeTodayPanel } from '@/components/peakFade/PeakFadeTodayPanel';
import { usePeakFadeTrades } from '@/hooks/usePeakFadeTrades';

export default function PeakFadePage() {
  const { closedRows, openRows, todayRows, stats, loading, error } = usePeakFadeTrades();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-400">Loading Peak Fade…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-400">Error: {error}</p>
        <p className="mt-2 text-sm text-slate-500">
          Apply migration 075_peak_fade_engine.sql if the table is missing.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-white p-4 dark:bg-slate-950 sm:p-6">
      <PeakFadePageHeader stats={stats} />
      <div className="flex flex-col gap-6">
        <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          <p className="font-medium text-slate-900 dark:text-slate-100">What this is</p>
          <p className="mt-2">
            Fade yesterday&apos;s AUDUSD high/low after a short push into that extreme.
            Broker take-profit at 9 pips, no stop loss. High-impact AUD/USD news blocks new
            entries from T−2h to T+1h. Equity-proportional size; VT fan-out ready via
            dedicated demo links. Requires <code>PEAK_FADE_ENABLED=true</code>.
          </p>
        </section>
        <PeakFadeTodayPanel todayRows={todayRows} openRows={openRows} />
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
            Trade history
          </h2>
          <PeakFadeHistoryTable closedRows={closedRows} />
        </section>
      </div>
    </div>
  );
}
