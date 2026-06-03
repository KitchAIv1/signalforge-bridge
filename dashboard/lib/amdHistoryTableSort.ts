import type { AmdState } from '@/lib/types';

export type AmdHistorySortColumn = 'trade_date' | 'judas_pips' | 'window_pip_move';

export interface AmdHistorySortState {
  column: AmdHistorySortColumn;
  direction: 'asc' | 'desc';
}

export function sortAmdHistoryRows(
  rows: AmdState[],
  sortState: AmdHistorySortState | null,
): AmdState[] {
  if (!sortState) return rows;

  const sorted = [...rows];
  const { column, direction } = sortState;
  const multiplier = direction === 'asc' ? 1 : -1;

  sorted.sort((rowA, rowB) => {
    if (column === 'trade_date') {
      return rowA.trade_date.localeCompare(rowB.trade_date) * multiplier;
    }

    const valueA = rowA[column];
    const valueB = rowB[column];

    if (valueA == null && valueB == null) return 0;
    if (valueA == null) return 1;
    if (valueB == null) return -1;
    return (Number(valueA) - Number(valueB)) * multiplier;
  });

  return sorted;
}

export function toggleSortState(
  current: AmdHistorySortState | null,
  column: AmdHistorySortColumn,
): AmdHistorySortState {
  if (current?.column === column) {
    return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  if (column === 'trade_date') return { column, direction: 'desc' };
  return { column, direction: 'desc' };
}

export function sortIndicator(
  sortState: AmdHistorySortState | null,
  column: AmdHistorySortColumn,
): string {
  if (sortState?.column !== column) return '';
  return sortState.direction === 'asc' ? ' ↑' : ' ↓';
}
