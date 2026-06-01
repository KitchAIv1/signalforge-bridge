export const DIRECTION_COLUMN_CARD_CLASS =
  'flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800';

export function sessionStatusBadgeClass(phase: string): string {
  if (phase === 'active') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
  }
  if (phase === 'completed') {
    return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
  }
  return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
}
