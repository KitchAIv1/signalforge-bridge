'use client';

import type { AmdState } from '@/lib/types';
import { AmdHistoryChart } from '@/components/AmdHistoryChart';

interface AmdHistoryDetailPanelProps {
  selectedRow: AmdState;
  onClose: () => void;
}

export function AmdHistoryDetailPanel({ selectedRow, onClose }: AmdHistoryDetailPanelProps) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">{selectedRow.trade_date}</h2>
        <button type="button" onClick={() => onClose()} className="text-xs text-slate-400 hover:text-slate-600">
          Close ✕
        </button>
      </div>

      <AmdHistoryChart amdState={selectedRow} />
    </div>
  );
}
