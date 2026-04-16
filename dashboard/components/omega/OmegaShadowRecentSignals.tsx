'use client';

import { useState } from 'react';
import type { OmegaShadowSignalRow } from '@/lib/types';
import { OmegaShadowRecentSignalRow } from '@/components/omega/OmegaShadowRecentSignalRow';

interface OmegaShadowRecentSignalsProps {
  signals: OmegaShadowSignalRow[];
}

export function OmegaShadowRecentSignals({
  signals,
}: OmegaShadowRecentSignalsProps) {
  const [visibleCount, setVisibleCount] = useState(20);
  const totalSignals = signals.length;
  const showing = Math.min(visibleCount, totalSignals);
  const visibleRows = signals.slice(0, showing);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
        Recent signals
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100">
              <th className="text-left pb-2 pr-3">Time</th>
              <th className="text-left pb-2 pr-3">Dir</th>
              <th className="text-left pb-2 pr-3">Session</th>
              <th className="text-left pb-2 pr-3">Regime</th>
              <th className="text-right pb-2 pr-3">Conf</th>
              <th className="text-right pb-2 pr-3">Spread/R</th>
              <th className="text-right pb-2 pr-4">R (pips)</th>
              <th className="text-right pb-2 pr-4">MFE</th>
              <th className="text-left pb-2 pr-4 min-w-[80px]">News</th>
              <th className="text-right pb-2 min-w-[64px]">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <OmegaShadowRecentSignalRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-col items-center gap-2 border-t border-slate-100 pt-3">
        <div className="text-xs text-slate-500">
          Showing {totalSignals === 0 ? 0 : showing} of {totalSignals} signals
        </div>
        {visibleCount < totalSignals && (
          <button
            type="button"
            onClick={() =>
              setVisibleCount((prev) => Math.min(prev + 20, totalSignals))
            }
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Show more
          </button>
        )}
      </div>
    </div>
  );
}
