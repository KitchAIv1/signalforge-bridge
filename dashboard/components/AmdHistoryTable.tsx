'use client';

import type { AmdState } from '@/lib/types';
import { amdTagColor, amdTagLabel, m5SignalLabel, m5SignalColor, outcomeTagLabel, outcomeTagColor } from '@/lib/amdPanelFormatters';
import { asianCloseBiasColor } from '@/lib/asianCloseBiasHelpers';

interface AmdHistoryTableProps {
  rows: AmdState[];
  selectedId: string | null;
  onSelect: (row: AmdState) => void;
  filterTag: string;
  onFilterChange: (tag: string) => void;
}

const ALL_TAGS = [
  'ALL',
  'AMD_TEXTBOOK',
  'AMD_COMPRESSION_BREAKOUT',
  'AMD_FAILED',
  'AMD_SHIFTED',
  'AMD_NONE',
  'INSUFFICIENT_DATA',
] as const;

export function AmdHistoryTable({
  rows,
  selectedId,
  onSelect,
  filterTag,
  onFilterChange,
}: AmdHistoryTableProps) {
  const filtered = filterTag === 'ALL' ? rows : rows.filter((historyRow) => historyRow.amd_tag === filterTag);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {ALL_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onFilterChange(tag)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterTag === tag
                ? 'bg-slate-700 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {tag === 'ALL' ? 'All' : amdTagLabel(tag)}{' '}
            {tag === 'ALL' ? `(${rows.length})` : `(${rows.filter((historyRow) => historyRow.amd_tag === tag).length})`}
          </button>
        ))}
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Tag</th>
              <th className="px-3 py-2 text-left">Judas</th>
              <th className="px-3 py-2 text-left">Pips</th>
              <th className="px-3 py-2 text-left">Asian</th>
              <th className="px-3 py-2 text-left">Asian Bias</th>
              <th className="px-3 py-2 text-left">Reversal</th>
              <th className="px-3 py-2 text-left">M5</th>
              <th className="px-3 py-2 text-left">Outcome</th>
              <th className="px-3 py-2 text-left">Chart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((historyRow) => (
              <tr
                key={historyRow.id}
                onClick={() => onSelect(historyRow)}
                className={`cursor-pointer transition-colors ${
                  selectedId === historyRow.id
                    ? 'bg-blue-50 dark:bg-blue-950/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
                  {historyRow.trade_date}
                </td>
                <td className={`px-3 py-2 font-medium ${amdTagColor(historyRow.amd_tag)}`}>
                  {amdTagLabel(historyRow.amd_tag)}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                  {historyRow.judas_direction ?? '—'}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{historyRow.judas_pips ?? '—'}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                  {historyRow.asian_range_pips ?? '—'}p {historyRow.asian_is_flat ? '✓' : ''}
                </td>
                <td className="px-3 py-2">
                  {historyRow.asian_close_bias_signal ? (
                    <span className={`text-xs font-medium ${asianCloseBiasColor(historyRow.asian_close_bias_signal)}`}>
                      {historyRow.asian_close_bias_signal === 'BULLISH' ? '↑'
                        : historyRow.asian_close_bias_signal === 'BEARISH' ? '↓'
                        : '—'}
                      {' '}
                      {historyRow.asian_close_position_pct?.toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {historyRow.reversal_confirmed === true ? (
                    <span className="text-green-500">✓</span>
                  ) : historyRow.reversal_confirmed === false ? (
                    <span className="text-red-400">✗</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className={`px-3 py-2 text-xs font-medium ${m5SignalColor(historyRow.m5_vs_judas_direction)}`}>
                  {m5SignalLabel(historyRow.m5_vs_judas_direction)}
                </td>
                <td className={`px-3 py-2 text-xs font-medium ${outcomeTagColor(historyRow.amd_outcome_tag)}`}>
                  {outcomeTagLabel(historyRow.amd_outcome_tag)}
                </td>
                <td className="px-3 py-2">
                  {historyRow.chart_data != null ? (
                    <span className="text-xs text-blue-400">Click to view</span>
                  ) : (
                    <span className="text-xs text-slate-500">No data</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Showing {filtered.length} of {rows.length} days
      </p>
    </div>
  );
}
