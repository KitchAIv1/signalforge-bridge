import type { DolBacktestRow } from './types.js';

export function pct(hits: number, total: number): string {
  return total === 0 ? 'n/a' : `${((hits / total) * 100).toFixed(1)}%`;
}

export function avg(values: Array<number | null>): string {
  const finiteValues = values.filter((value): value is number => value != null);
  if (!finiteValues.length) return 'n/a';
  return (finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length).toFixed(2);
}

export function isScorableForAccuracy(row: DolBacktestRow): boolean {
  return row.amd_tag !== 'INSUFFICIENT_DATA' && row.predicted_production !== 'neutral';
}

export function isScorableForDol(row: DolBacktestRow): boolean {
  return isScorableForAccuracy(row) && row.dol_already_passed !== true;
}

export function accuracyHits(
  rows: DolBacktestRow[],
  matchField: keyof DolBacktestRow
): { hits: number; total: number } {
  const scored = rows.filter(
    (row) => isScorableForAccuracy(row) && row[matchField] != null
  );
  const hits = scored.filter((row) => row[matchField] === true).length;
  return { hits, total: scored.length };
}

export function dolAccuracyHits(rows: DolBacktestRow[]): { hits: number; total: number } {
  const scored = rows.filter((row) => isScorableForDol(row) && row.dol_reached != null);
  const hits = scored.filter((row) => row.dol_reached === true).length;
  return { hits, total: scored.length };
}

export function ppDelta(currentPct: number, baselinePct: number): string {
  const delta = currentPct - baselinePct;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp`;
}

export function parsePct(value: string): number | null {
  if (value === 'n/a') return null;
  return parseFloat(value.replace('%', ''));
}
