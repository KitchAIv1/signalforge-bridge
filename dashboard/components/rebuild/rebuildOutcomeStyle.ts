export function rebuildOutcomeTextClass(outcome: string | null | undefined): string {
  const x = (outcome ?? '').toLowerCase();
  if (x === 'tp' || x.startsWith('tp')) return 'text-emerald-700 font-medium';
  if (x === 'sl') return 'text-red-600 font-medium';
  if (x === 'time_exit' || x === 'expired') return 'text-amber-600 font-medium';
  return 'text-slate-400';
}
