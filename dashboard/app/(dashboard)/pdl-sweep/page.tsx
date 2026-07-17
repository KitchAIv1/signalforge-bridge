'use client';

import { usePdlSweepSignals } from '@/hooks/usePdlSweepSignals';
import { usePdlWindowLiveStatus } from '@/hooks/usePdlWindowLiveStatus';
import { PdlSweepPageHeader } from '@/components/pdlSweep/PdlSweepPageHeader';
import { PdlSweepForwardGate } from '@/components/pdlSweep/PdlSweepForwardGate';
import { PdlSweepLiveConditions } from '@/components/pdlSweep/PdlSweepLiveConditions';
import { PdlSweepHistoryTable } from '@/components/pdlSweep/PdlSweepHistoryTable';
import type { PdlSweepSignalRow } from '@/lib/pdlSweepTypes';

function TodayMissingBanner({ todayUtc }: { todayUtc: string }) {
  return (
    <div className="rounded-lg border border-blue-700/40 bg-blue-950/30 px-4 py-3">
      <p className="text-sm text-blue-300">
        Today&apos;s PDL detection ({todayUtc}) has not run yet — scheduled for 12:10 UTC
      </p>
    </div>
  );
}

function LiveStatusBanner({
  engineActive,
  paused,
}: {
  engineActive: boolean;
  paused: boolean;
}) {
  if (!engineActive) {
    return (
      <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-900">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Live engine <strong>pdl_window</strong> not registered / inactive. Research shadow
          detection still runs. Set <code className="text-xs">PDL_WINDOW_ENABLED=true</code> and
          apply migration 061 to arm.
        </p>
      </div>
    );
  }
  if (paused) {
    return (
      <div className="rounded-lg border border-amber-600/40 bg-amber-950/20 px-4 py-3">
        <p className="text-sm text-amber-300">
          Live engine armed but <strong>paused</strong> in Activity Controls — no new entries.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-emerald-600/40 bg-emerald-950/20 px-4 py-3">
      <p className="text-sm text-emerald-300">
        Live engine armed — LONG 12:00–15:00 unless all-3-false · SL 20p · shares Fade OANDA/MT5
        (OANDA blocks if Fade open).
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
  const { engineActive, paused, loading: statusLoading } = usePdlWindowLiveStatus();

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
  const liveArmed = engineActive && !paused;

  return (
    <div className="flex flex-col bg-white p-4 dark:bg-slate-950 sm:p-6">
      <PdlSweepPageHeader rows={rows} firedRows={firedRows} liveArmed={liveArmed} />

      <div className="flex flex-col gap-6">
        {!statusLoading ? (
          <LiveStatusBanner engineActive={engineActive} paused={paused} />
        ) : null}

        <PdlSweepForwardGate firedCount={firedRows.length} liveArmed={liveArmed} />

        {showTodayBanner ? <TodayMissingBanner todayUtc={todayUtc} /> : null}

        <PdlSweepLiveConditions
          todayRow={todayRow}
          liveArmed={liveArmed}
          paused={paused}
        />

        <section>
          <h2 className="mb-3 text-sm font-medium text-slate-500 uppercase tracking-wide">
            Signal history
          </h2>
          <p className="mb-2 text-xs text-slate-500">
            Live fills appear in Activity (filter PDL Window). Calendar chip is optional / off by
            default.
          </p>
          <PdlSweepHistoryTable firedRows={firedRows} nonFiredRows={nonFiredRows} />
        </section>
      </div>
    </div>
  );
}
