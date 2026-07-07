'use client';

import { ActivityTradeDesktopTable } from '@/components/activity/ActivityTradeDesktopTable';
import { ActivityTradeMobileList } from '@/components/activity/ActivityTradeMobileList';
import { Phase2FlagSummary } from '@/components/omegaPhase2/Phase2FlagSummary';
import { useActivityTradeLog } from '@/hooks/useActivityTradeLog';
import { OMEGA_LANE_B_BROKER_ID } from '@/lib/omegaLaneBConstants';

export default function OmegaPhase2ActivityPage() {
  const { rows, loading, hasMore, loadMore } = useActivityTradeLog({
    decision: 'EXECUTED',
    engineId: 'omega',
    brokerId: OMEGA_LANE_B_BROKER_ID,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Omega Phase 2 (Lane B)
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Experiment lane only — broker {OMEGA_LANE_B_BROKER_ID} (AUD_NEWWWW). Baseline Activity is
        unchanged.
      </p>

      <Phase2FlagSummary />

      <ActivityTradeMobileList rows={rows} isTradeListLoading={loading} />
      <ActivityTradeDesktopTable rows={rows} isTradeListLoading={loading} />

      {hasMore && rows.length > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
