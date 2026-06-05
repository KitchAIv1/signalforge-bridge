'use client';

import { useMemo, useState } from 'react';
import type { AmdState } from '@/lib/types';
import {
  amdTagColor,
  amdTagLabel,
  autoDirectionLabel,
  autoDirectionConfidenceShort,
  dailyBiasAlignmentLabel,
  dailyBiasAlignmentColor,
  m5SignalLabel,
  m5SignalColor,
  outcomeTagLabel,
  outcomeTagColor,
} from '@/lib/amdPanelFormatters';
import { asianCloseBiasColor } from '@/lib/asianCloseBiasHelpers';
import {
  sortAmdHistoryRows,
  toggleSortState,
  sortIndicator,
  type AmdHistorySortState,
  type AmdHistorySortColumn,
} from '@/lib/amdHistoryTableSort';
import {
  AmdHistoryTableFilters,
  type OutcomeFilterValue,
  type AlignmentFilterValue,
  type JudasFilterValue,
} from '@/components/AmdHistoryTableFilters';

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

function applyOutcomeFilter(row: AmdState, outcomeFilter: OutcomeFilterValue): boolean {
  if (outcomeFilter === 'ALL') return true;
  if (outcomeFilter === 'PENDING') return row.amd_outcome_tag == null;
  return row.amd_outcome_tag === outcomeFilter;
}

function applyAlignmentFilter(row: AmdState, alignmentFilter: AlignmentFilterValue): boolean {
  if (alignmentFilter === 'ALL') return true;
  return row.daily_bias_alignment === alignmentFilter;
}

function applyJudasFilter(row: AmdState, judasFilter: JudasFilterValue): boolean {
  if (judasFilter === 'ALL') return true;
  return row.judas_direction === judasFilter;
}

function SortableHeader({
  label,
  column,
  sortState,
  onSort,
}: {
  label: string;
  column: AmdHistorySortColumn;
  sortState: AmdHistorySortState | null;
  onSort: (column: AmdHistorySortColumn) => void;
}) {
  return (
    <th className="px-3 py-2 text-left">
      <button
        type="button"
        onClick={() => onSort(column)}
        className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        {label}
        {sortIndicator(sortState, column)}
      </button>
    </th>
  );
}

export function AmdHistoryTable({
  rows,
  selectedId,
  onSelect,
  filterTag,
  onFilterChange,
}: AmdHistoryTableProps) {
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilterValue>('ALL');
  const [alignmentFilter, setAlignmentFilter] = useState<AlignmentFilterValue>('ALL');
  const [judasFilter, setJudasFilter] = useState<JudasFilterValue>('ALL');
  const [sortState, setSortState] = useState<AmdHistorySortState | null>(null);

  const filtered = useMemo(() => {
    const tagFiltered = filterTag === 'ALL' ? rows : rows.filter((row) => row.amd_tag === filterTag);
    return tagFiltered.filter(
      (row) =>
        applyOutcomeFilter(row, outcomeFilter) &&
        applyAlignmentFilter(row, alignmentFilter) &&
        applyJudasFilter(row, judasFilter),
    );
  }, [rows, filterTag, outcomeFilter, alignmentFilter, judasFilter]);

  const displayedRows = useMemo(
    () => sortAmdHistoryRows(filtered, sortState),
    [filtered, sortState],
  );

  function handleSort(column: AmdHistorySortColumn): void {
    setSortState((current) => toggleSortState(current, column));
  }

  function handleClearFilters(): void {
    onFilterChange('ALL');
    setOutcomeFilter('ALL');
    setAlignmentFilter('ALL');
    setJudasFilter('ALL');
  }

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
            {tag === 'ALL' ? `(${rows.length})` : `(${rows.filter((row) => row.amd_tag === tag).length})`}
          </button>
        ))}
      </div>

      <AmdHistoryTableFilters
        outcomeFilter={outcomeFilter}
        onOutcomeFilterChange={setOutcomeFilter}
        alignmentFilter={alignmentFilter}
        onAlignmentFilterChange={setAlignmentFilter}
        judasFilter={judasFilter}
        onJudasFilterChange={setJudasFilter}
        onClearFilters={handleClearFilters}
        hasActiveFilters={
          filterTag !== 'ALL' ||
          outcomeFilter !== 'ALL' ||
          alignmentFilter !== 'ALL' ||
          judasFilter !== 'ALL'
        }
      />

      <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800">
            <tr>
              <SortableHeader label="Date" column="trade_date" sortState={sortState} onSort={handleSort} />
              <th className="px-3 py-2 text-left">Tag</th>
              <th className="px-3 py-2 text-left">Alignment</th>
              <th className="px-3 py-2 text-left">Auto Dir</th>
              <th className="px-3 py-2 text-left">Judas</th>
              <th className="px-3 py-2 text-left">⚡ Timing</th>
              <SortableHeader label="Pips" column="judas_pips" sortState={sortState} onSort={handleSort} />
              <th className="px-3 py-2 text-left">Asian</th>
              <th className="px-3 py-2 text-left">⚡ Qual</th>
              <th className="px-3 py-2 text-left">Asian Bias</th>
              <th className="px-3 py-2 text-left">Reversal</th>
              <th className="px-3 py-2 text-left">M5</th>
              <th className="px-3 py-2 text-left">⚡ Momentum</th>
              <th className="px-3 py-2 text-left">Outcome</th>
              <SortableHeader label="Win pips" column="window_pip_move" sortState={sortState} onSort={handleSort} />
              <th className="px-3 py-2 text-left">Chart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {displayedRows.map((historyRow) => (
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
                <td className={`px-3 py-2 text-xs ${dailyBiasAlignmentColor(historyRow.daily_bias_alignment)}`}>
                  {dailyBiasAlignmentLabel(historyRow.daily_bias_alignment)}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                  {historyRow.auto_direction ? (
                    <>
                      {autoDirectionLabel(historyRow.auto_direction)}
                      <span className="ml-1 text-slate-400">
                        {autoDirectionConfidenceShort(historyRow.auto_direction_confidence)}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                  {historyRow.judas_direction ?? '—'}
                </td>
                <td className="px-3 py-2">
                  {(() => {
                    const timing = historyRow.judas_timing;
                    if (timing === 'LATE') {
                      return (
                        <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20">
                          Late H9
                        </span>
                      );
                    }
                    if (timing === 'EARLY') {
                      return (
                        <span className="rounded px-1.5 py-0.5 text-xs font-semibold text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20">
                          Early H8
                        </span>
                      );
                    }
                    return <span className="text-xs text-muted-foreground">—</span>;
                  })()}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{historyRow.judas_pips ?? '—'}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                  {historyRow.asian_range_pips ?? '—'}p {historyRow.asian_is_flat ? '✓' : ''}
                </td>
                <td className="px-3 py-2">
                  {(() => {
                    const score = historyRow.accumulation_quality_score;
                    const display = score != null ? `${Math.round(score * 100)}%` : '—';
                    const color =
                      score == null      ? 'text-muted-foreground' :
                      score >= 0.65      ? 'text-green-600' :
                      score >= 0.45      ? 'text-yellow-600' :
                                           'text-muted-foreground';
                    return <span className={color}>{display}</span>;
                  })()}
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
                <td className="px-3 py-2 text-xs">
                  {(() => {
                    const momentum = historyRow.m5_momentum_type;
                    const display = momentum ?? '—';
                    const color =
                      momentum === 'SUSTAINED' ? 'text-green-600' :
                      momentum === 'REVERSED'  ? 'text-red-500' :
                      momentum === 'STALLED'   ? 'text-yellow-600' :
                      'text-muted-foreground';
                    return <span className={color}>{display}</span>;
                  })()}
                </td>
                <td className={`px-3 py-2 text-xs font-medium ${outcomeTagColor(historyRow.amd_outcome_tag)}`}>
                  {outcomeTagLabel(historyRow.amd_outcome_tag)}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                  {historyRow.window_pip_move != null ? historyRow.window_pip_move : '—'}
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
        Showing {displayedRows.length} of {rows.length} days
      </p>
    </div>
  );
}
