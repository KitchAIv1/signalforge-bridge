import type { PdlSweepSignalRow } from '@/lib/pdlSweepTypes';

export function isPdlOutcomeCorrect(row: PdlSweepSignalRow): boolean | null {
  if (row.outcome_h12_direction == null) return null;
  return row.signal_direction === 'long' && row.outcome_h12_direction === 'UP';
}

export function computePdlForwardWinRate(firedRows: PdlSweepSignalRow[]): string {
  const evaluated = firedRows.filter((row) => row.outcome_h12_direction != null);
  if (evaluated.length === 0) return '—';
  const wins = evaluated.filter((row) => isPdlOutcomeCorrect(row) === true).length;
  return `${Math.round((wins / evaluated.length) * 100)}% (${wins}/${evaluated.length})`;
}
