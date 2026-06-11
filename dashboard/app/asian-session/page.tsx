'use client';

import { useAsianSessionDetection } from '@/hooks/useAsianSessionDetection';
import { AsianSessionForwardGate } from '@/components/asianSession/AsianSessionForwardGate';
import { AsianSessionHistoryTable } from '@/components/asianSession/AsianSessionHistoryTable';
import { AsianSessionPageHeader } from '@/components/asianSession/AsianSessionPageHeader';
import { AsianSessionTodayPanel } from '@/components/asianSession/AsianSessionTodayPanel';

export default function AsianSessionPage() {
  const { rows, todayRow, todayChecks, firedRows, noFireDays, d1Config, loading, error } =
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
      <AsianSessionPageHeader rows={rows} firedRows={firedRows} />

      <div className="flex flex-col gap-6">
        <AsianSessionForwardGate firedRows={firedRows} />

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
