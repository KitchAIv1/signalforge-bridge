'use client';

import { useState } from 'react';
import { useAmdHistory } from '@/hooks/useAmdHistory';
import { AmdHistoryTable } from '@/components/AmdHistoryTable';
import { AmdHistoryDetailPanel } from '@/components/AmdHistoryDetailPanel';
import type { AmdState } from '@/lib/types';

export default function AmdHistoryPage() {
  const { rows, loading, error } = useAmdHistory();
  const [selectedRow, setSelectedRow] = useState<AmdState | null>(null);
  const [filterTag, setFilterTag] = useState('ALL');

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

  return (
    <div className="min-h-screen bg-white p-4 dark:bg-slate-950 sm:p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">AMD Intelligence History</h1>
        <p className="mt-1 text-sm text-slate-500">
          {rows.length} trading days — click any row to verify the AMD chart
        </p>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <section className="w-full lg:w-1/2 xl:w-2/5">
          <AmdHistoryTable
            rows={rows}
            selectedId={selectedRow?.id ?? null}
            onSelect={setSelectedRow}
            filterTag={filterTag}
            onFilterChange={setFilterTag}
          />
        </section>

        <aside className="w-full lg:sticky lg:top-6 lg:w-1/2 lg:self-start xl:w-3/5">
          {selectedRow != null ? (
            <AmdHistoryDetailPanel selectedRow={selectedRow} onClose={() => setSelectedRow(null)} />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
              <p className="text-sm text-slate-400">Select a date to view the AMD chart</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
