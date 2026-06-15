'use client';

import { usePdlSweepSignals } from '@/hooks/usePdlSweepSignals';
import { PdlSweepPageHeader } from '@/components/pdlSweep/PdlSweepPageHeader';
import { PdlSweepForwardGate } from '@/components/pdlSweep/PdlSweepForwardGate';
import { PdlSweepLiveConditions } from '@/components/pdlSweep/PdlSweepLiveConditions';
import { PdlSweepHistoryTable } from '@/components/pdlSweep/PdlSweepHistoryTable';
import type { PdlSweepSignalRow } from '@/lib/pdlSweepTypes';

function TodayMissingBanner({ todayUtc }: { todayUtc: string }) {
  return (
    <div className="rounded-lg border border-blue-700/40 bg-blue-950/30 px-4 py-3">
      <p className="text-sm text-blue-300">
        Today&apos;s PDL sweep detection ({todayUtc}) has not run yet — scheduled for 11:55 UTC
      </p>
    </div>
  );
}

function shouldShowTodayBanner(rows: PdlSweepSignalRow[]): boolean {
  const todayUtc = new Date().toISOString().slice(0, 10);
  const weekday = new Date().getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const hour = new Date().getUTCHours();
  if (hour < 12) return false;
  return !rows.some((row) => row.trade_date === todayUtc);
}

export default function PdlSweepPage() {
  const { rows, todayRow, firedRows, nonFiredRows, loading, error } = usePdlSweepSignals();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-400">Loading PDL sweep signals...</p>
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

  const todayUtc = new Date().toISOString().slice(0, 10);
  const showTodayBanner = shouldShowTodayBanner(rows);

  return (
    <div className="flex flex-col bg-white p-4 dark:bg-slate-950 sm:p-6">
      <PdlSweepPageHeader rows={rows} firedRows={firedRows} />

      <div className="flex flex-col gap-6">
        <PdlSweepForwardGate firedCount={firedRows.length} />

        {showTodayBanner ? <TodayMissingBanner todayUtc={todayUtc} /> : null}

        <PdlSweepLiveConditions todayRow={todayRow} />

        <section>
          <h2 className="mb-3 text-sm font-medium text-slate-500 uppercase tracking-wide">
            Signal history
          </h2>
          <PdlSweepHistoryTable firedRows={firedRows} nonFiredRows={nonFiredRows} />
        </section>
      </div>
    </div>
  );
}
