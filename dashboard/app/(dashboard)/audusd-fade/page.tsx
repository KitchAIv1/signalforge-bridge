'use client';

import { useAudusdFadeTrades } from '@/hooks/useAudusdFadeTrades';
import { AudusdFadeHistoryTable } from '@/components/audusdFade/AudusdFadeHistoryTable';
import { AudusdFadePageHeader } from '@/components/audusdFade/AudusdFadePageHeader';
import { AudusdFadeTodayPanel } from '@/components/audusdFade/AudusdFadeTodayPanel';

export default function AudusdFadePage() {
  const { closedRows, openRows, todayRows, stats, loading, error } = useAudusdFadeTrades();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-400">Loading AUDUSD Fade trades...</p>
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
      <AudusdFadePageHeader stats={stats} />

      <div className="flex flex-col gap-6">
        <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          <p className="font-medium text-slate-900 dark:text-slate-100">What this is</p>
          <p className="mt-2">
            Mean-reversion fade on AUD/USD when price stretches ≥30 pips from the 50-bar M5 SMA.
            EUR/USD 4-hour momentum must pass the aligned gate (≥ −50p). Bracket exit T10/S15,
            max 2 trades/day, 4h max hold. Paper execution on OANDA practice.
          </p>
        </section>

        <AudusdFadeTodayPanel todayRows={todayRows} openRows={openRows} />

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
            Trade history
          </h2>
          <AudusdFadeHistoryTable closedRows={closedRows} />
        </section>
      </div>
    </div>
  );
}
