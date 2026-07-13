'use client';

import { useCallback, useState } from 'react';
import { AlphaOmegaLiveMachinePanel } from '@/components/omegaPhase2/AlphaOmegaLiveMachinePanel';
import { AlphaOmegaScoreboard } from '@/components/omegaPhase2/AlphaOmegaScoreboard';
import { AlphaOmegaTradeDetailDrawer } from '@/components/omegaPhase2/AlphaOmegaTradeDetailDrawer';
import { Phase2FlagSummary } from '@/components/omegaPhase2/Phase2FlagSummary';
import { Phase2ShadowTradeDesktopTable } from '@/components/omegaPhase2/Phase2ShadowTradeDesktopTable';
import { Phase2ShadowTradeMobileList } from '@/components/omegaPhase2/Phase2ShadowTradeMobileList';
import {
  Phase2ViewFilterBar,
  type Phase2ViewFilter,
} from '@/components/omegaPhase2/Phase2ViewFilterBar';
import { usePhase2TradeLog } from '@/hooks/usePhase2TradeLog';
import { usePhase2ScoreboardRows } from '@/hooks/usePhase2ScoreboardRows';
import { downloadAlphaOmegaTradeCsv } from '@/lib/alphaOmegaTradeCsv';
import { ALPHAOMEGA_PAGE_TITLE, OMEGA_LANE_B_BROKER_ID } from '@/lib/omegaLaneBConstants';
import type { BridgeTradeLogRow } from '@/lib/types';

export default function OmegaPhase2ActivityPage() {
  const [viewFilter, setViewFilter] = useState<Phase2ViewFilter>('all');
  const [selectedTrade, setSelectedTrade] = useState<BridgeTradeLogRow | null>(null);
  const { rows, rawRows, loading, hasMore, loadMore } = usePhase2TradeLog(viewFilter);
  const { tradeRows: scoreboardRows } = usePhase2ScoreboardRows();

  const handleExportCsv = useCallback(() => {
    downloadAlphaOmegaTradeCsv(rows);
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {ALPHAOMEGA_PAGE_TITLE}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Broker {OMEGA_LANE_B_BROKER_ID} (AUD_NEWWWW). Crack entry + speed floor + opposing /
            hard-stop / backstop exits.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={rows.length === 0}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Export CSV
        </button>
      </div>

      <Phase2FlagSummary />
      <AlphaOmegaLiveMachinePanel />
      <AlphaOmegaScoreboard tradeRows={scoreboardRows} />
      <Phase2ViewFilterBar activeFilter={viewFilter} onFilterChange={setViewFilter} />

      <Phase2ShadowTradeMobileList
        tradeRows={rows}
        isTradeListLoading={loading}
        onSelectTrade={setSelectedTrade}
      />
      <Phase2ShadowTradeDesktopTable
        tradeRows={rows}
        isTradeListLoading={loading}
        onSelectTrade={setSelectedTrade}
      />

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

      <AlphaOmegaTradeDetailDrawer
        tradeRow={selectedTrade}
        onClose={() => setSelectedTrade(null)}
      />
    </div>
  );
}
