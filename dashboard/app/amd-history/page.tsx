'use client';

import { useState } from 'react';
import { useAmdHistory } from '@/hooks/useAmdHistory';
import { useAmdTradeEntry } from '@/hooks/useAmdTradeEntry';
import { AmdHistoryTable } from '@/components/AmdHistoryTable';
import { AmdHistoryDetailPanel } from '@/components/AmdHistoryDetailPanel';
import type { AmdState } from '@/lib/types';
import { AmdReferenceModal } from '@/components/amdReference/AmdReferenceModal';

function TodayMissingBanner({ todayUtc }: { todayUtc: string }) {
  return (
    <div className="rounded-lg border border-blue-700/40 bg-blue-950/30 px-4 py-3">
      <p className="text-sm text-blue-300">
        📡 Today&apos;s AMD detection ({todayUtc}) has not run yet — scheduled for 10:31 UTC
      </p>
    </div>
  );
}

function shouldShowTodayBanner(rows: AmdState[]): boolean {
  const todayUtc = new Date().toISOString().slice(0, 10);
  const weekday = new Date().getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !rows.some((row) => row.trade_date === todayUtc);
}

export default function AmdHistoryPage() {
  const { rows, loading, error } = useAmdHistory();
  const [selectedRow, setSelectedRow] = useState<AmdState | null>(null);
  const [filterTag, setFilterTag] = useState('ALL');
  const { tradeEntry } = useAmdTradeEntry(selectedRow?.trade_date ?? null);

  const forceOutcomePending =
    process.env.NODE_ENV === 'development' &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('forceOutcomePending') === '1';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-400">Loading AMD history...</p>
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
    <div className="flex flex-col bg-white p-4 dark:bg-slate-950 sm:p-6 lg:box-border lg:h-[calc(100svh-3rem)] lg:min-h-0 lg:overflow-hidden">
      <header className="mb-6 shrink-0 lg:mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">AMD Intelligence History</h1>
          <AmdReferenceModal />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {rows.length} trading days — click any row to verify the AMD chart
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-6 lg:min-h-0 lg:gap-0 lg:flex-row lg:overflow-hidden">
        <section className="flex w-full flex-col lg:min-h-0 lg:w-1/2 lg:overflow-hidden xl:w-2/5">
          {showTodayBanner ? (
            <div className="mb-4 shrink-0 lg:pr-3">
              <TodayMissingBanner todayUtc={todayUtc} />
            </div>
          ) : null}

          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-3">
            <AmdHistoryTable
              rows={rows}
              selectedId={selectedRow?.id ?? null}
              onSelect={setSelectedRow}
              filterTag={filterTag}
              onFilterChange={setFilterTag}
            />
          </div>
        </section>

        <aside className="flex w-full flex-col lg:min-h-0 lg:w-1/2 lg:overflow-hidden xl:w-3/5">
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pl-3">
            {selectedRow != null ? (
              <AmdHistoryDetailPanel
                selectedRow={selectedRow}
                onClose={() => setSelectedRow(null)}
                tradeEntry={tradeEntry}
                forceOutcomePending={forceOutcomePending || undefined}
              />
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                <p className="text-sm text-slate-400">Select a date to view the AMD chart</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
