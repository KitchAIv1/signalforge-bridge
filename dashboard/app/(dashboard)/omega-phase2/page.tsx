'use client';

import { useState } from 'react';
import { Phase2FlagSummary } from '@/components/omegaPhase2/Phase2FlagSummary';
import { Phase2ShadowStatsBar } from '@/components/omegaPhase2/Phase2ShadowStatsBar';
import { Phase2ShadowTradeDesktopTable } from '@/components/omegaPhase2/Phase2ShadowTradeDesktopTable';
import { Phase2ShadowTradeMobileList } from '@/components/omegaPhase2/Phase2ShadowTradeMobileList';
import { Phase2ViewFilterBar, type Phase2ViewFilter } from '@/components/omegaPhase2/Phase2ViewFilterBar';
import { usePhase2TradeLog } from '@/hooks/usePhase2TradeLog';
import { ALPHAOMEGA_PAGE_TITLE, OMEGA_LANE_B_BROKER_ID } from '@/lib/omegaLaneBConstants';

export default function OmegaPhase2ActivityPage() {
  const [viewFilter, setViewFilter] = useState<Phase2ViewFilter>('all');
  const { rows, rawRows, loading, hasMore, loadMore } = usePhase2TradeLog(viewFilter);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        {ALPHAOMEGA_PAGE_TITLE}
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Broker {OMEGA_LANE_B_BROKER_ID} (AUD_NEWWWW). Entry/exit run the validated streak +
        opposing-pressure + hard-stop logic; gate signal column shows what would block.
      </p>

      <Phase2FlagSummary />
      <Phase2ShadowStatsBar tradeRows={rawRows} />
      <Phase2ViewFilterBar activeFilter={viewFilter} onFilterChange={setViewFilter} />

      <Phase2ShadowTradeMobileList tradeRows={rows} isTradeListLoading={loading} />
      <Phase2ShadowTradeDesktopTable tradeRows={rows} isTradeListLoading={loading} />

      {hasMore && rawRows.length > 0 && (
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
