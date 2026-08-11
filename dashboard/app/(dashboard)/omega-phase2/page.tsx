'use client';

import { useCallback, useMemo, useState } from 'react';
import { AlphaOmegaLiveMachinePanel } from '@/components/omegaPhase2/AlphaOmegaLiveMachinePanel';
import { AlphaOmegaScoreboard } from '@/components/omegaPhase2/AlphaOmegaScoreboard';
import { AlphaOmegaTradeDetailDrawer } from '@/components/omegaPhase2/AlphaOmegaTradeDetailDrawer';
import {
  Phase2BookScopeBar,
  type Phase2BookScope,
} from '@/components/omegaPhase2/Phase2BookScopeBar';
import { Phase2FlagSummary } from '@/components/omegaPhase2/Phase2FlagSummary';
import { Phase2ShadowTradeDesktopTable } from '@/components/omegaPhase2/Phase2ShadowTradeDesktopTable';
import { Phase2ShadowTradeMobileList } from '@/components/omegaPhase2/Phase2ShadowTradeMobileList';
import {
  Phase2ViewFilterBar,
  type Phase2ViewFilter,
} from '@/components/omegaPhase2/Phase2ViewFilterBar';
import { usePhase2TradeLog } from '@/hooks/usePhase2TradeLog';
import { usePhase2ScoreboardRows } from '@/hooks/usePhase2ScoreboardRows';
import { useShadowAoTradeLog } from '@/hooks/useShadowAoTradeLog';
import { useSpeedfloorPaperOutcomes } from '@/hooks/useSpeedfloorPaperOutcomes';
import { aggregatePaperOutcomes } from '@/lib/alphaOmegaPaper/aggregatePaperOutcomes';
import { downloadAlphaOmegaTradeCsv } from '@/lib/alphaOmegaTradeCsv';
import {
  ALPHAOMEGA_PAGE_TITLE,
  OMEGA_AO_SHADOW_BROKER_ID,
  OMEGA_AO_VT_BROKER_ID,
  OMEGA_LANE_B_BROKER_ID,
} from '@/lib/omegaLaneBConstants';
import type { BridgeTradeLogRow } from '@/lib/types';

export default function OmegaPhase2ActivityPage() {
  const [bookScope, setBookScope] = useState<Phase2BookScope>('live');
  const [viewFilter, setViewFilter] = useState<Phase2ViewFilter>('all');
  const [selectedTrade, setSelectedTrade] = useState<BridgeTradeLogRow | null>(null);

  const liveLog = usePhase2TradeLog(viewFilter);
  const { tradeRows: scoreboardRows } = usePhase2ScoreboardRows();
  const shadowLog = useShadowAoTradeLog(bookScope === 'shadow');

  const isShadow = bookScope === 'shadow';
  const rows = isShadow ? shadowLog.rows : liveLog.rows;
  const loading = isShadow ? shadowLog.loading : liveLog.loading;
  const hasMore = isShadow ? shadowLog.hasMore : liveLog.hasMore;
  const loadMore = isShadow ? shadowLog.loadMore : liveLog.loadMore;
  const rawLen = isShadow ? shadowLog.rows.length : liveLog.rawRows.length;

  const paperSourceRows = useMemo(
    () => (isShadow ? [] : [...liveLog.rows, ...scoreboardRows]),
    [isShadow, liveLog.rows, scoreboardRows],
  );
  const { byTradeId: paperByTradeId, loading: paperLoading } =
    useSpeedfloorPaperOutcomes(paperSourceRows);
  const paperScore = useMemo(
    () => aggregatePaperOutcomes(paperByTradeId),
    [paperByTradeId],
  );

  const shadowNetPips = useMemo(() => {
    return shadowLog.rows.reduce((sum, row) => {
      if (row.status !== 'closed' || row.pnl_pips == null) return sum;
      return sum + Number(row.pnl_pips);
    }, 0);
  }, [shadowLog.rows]);

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
            Dual books: {OMEGA_LANE_B_BROKER_ID} (OANDA) + {OMEGA_AO_VT_BROKER_ID} (VT). Crack entry;
            speed keep (35–45m and {'>'}60m), drop ≤35m and 45–60m; Asia blackout 21:00–21:15 UTC;
            opposing / hard-stop / backstop exits. Shadow AO ({OMEGA_AO_SHADOW_BROKER_ID}) is paper
            only.
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

      <Phase2BookScopeBar activeScope={bookScope} onScopeChange={setBookScope} />

      {!isShadow && (
        <>
          <Phase2FlagSummary />
          <AlphaOmegaLiveMachinePanel />
          <AlphaOmegaScoreboard
            tradeRows={scoreboardRows}
            paperScore={paperScore}
            paperLoading={paperLoading}
          />
          <Phase2ViewFilterBar activeFilter={viewFilter} onFilterChange={setViewFilter} />
        </>
      )}

      {isShadow && (
        <div className="rounded border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100">
          <div className="font-semibold">Shadow AO paper net (closed)</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {shadowNetPips >= 0 ? '+' : ''}
            {shadowNetPips.toFixed(1)}p
          </div>
          <p className="mt-1 text-xs font-medium opacity-90">
            Paper only — not live risk. Live AO blocks (incl. Combined Stack AMD day
            gate) appear under Live → Blocked.
          </p>
          <p className="mt-1 text-xs opacity-80">
            Enable with bridge_config alpha_omega_shadow_enabled=true and engine
            OMEGA_AO_SHADOW_OVER_EMIT=true. Requires migration 065.
          </p>
        </div>
      )}

      <Phase2ShadowTradeMobileList
        tradeRows={rows}
        isTradeListLoading={loading}
        onSelectTrade={setSelectedTrade}
        paperByTradeId={isShadow ? {} : paperByTradeId}
        paperLoading={isShadow ? false : paperLoading}
      />
      <Phase2ShadowTradeDesktopTable
        tradeRows={rows}
        isTradeListLoading={loading}
        onSelectTrade={setSelectedTrade}
        paperByTradeId={isShadow ? {} : paperByTradeId}
        paperLoading={isShadow ? false : paperLoading}
      />

      {hasMore && rawLen > 0 && (
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
        paperOutcome={
          selectedTrade && !isShadow ? paperByTradeId[selectedTrade.id] : undefined
        }
        paperLoading={isShadow ? false : paperLoading}
      />
    </div>
  );
}
