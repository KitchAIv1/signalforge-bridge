import type { AmdState } from '@/lib/types';

export function describeAsianRangePips(state: AmdState): string {
  if (state.asian_range_pips == null) return '—';
  const qualifier =
    state.asian_is_flat === true ? ' (flat ✓)' : state.asian_is_flat === false ? ' (drifting)' : '';
  return `${state.asian_range_pips} pips${qualifier}`;
}

export function describeReversalStatus(state: AmdState): string {
  if (state.reversal_confirmed === true) return 'Confirmed ✓';
  if (state.reversal_confirmed === false) return 'Not confirmed';
  return '—';
}

export function reversalAccentClass(state: AmdState | null): string {
  if (state?.reversal_confirmed === true)
    return 'text-emerald-600 dark:text-emerald-400';
  if (state?.reversal_confirmed === false) return 'text-red-500 dark:text-red-400';
  return 'text-slate-500 dark:text-slate-400';
}

export function triStateYesNo(flag: boolean | undefined): string {
  if (flag === undefined) return '—';
  return flag ? 'Yes' : 'No';
}
