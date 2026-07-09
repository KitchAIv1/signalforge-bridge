/**
 * Shared display helpers for ALPHAOMEGA trade rows (PnL, duration, founding).
 */

import {
  formatFoundingSummary,
  parseAlphaOmegaFoundingMeta,
} from '@/lib/alphaOmegaAdvisoryParse';

export function formatSignedPips(pips: number | null | undefined): string {
  if (pips == null || Number.isNaN(Number(pips))) return '—';
  const value = Number(pips);
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}p`;
}

export function formatSignedDollars(dollars: number | null | undefined): string {
  if (dollars == null || Number.isNaN(Number(dollars))) return '—';
  const value = Number(dollars);
  return `${value >= 0 ? '+' : ''}$${value.toFixed(2)}`;
}

export function formatDurationMinutes(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(Number(minutes))) return '—';
  const total = Math.max(0, Math.round(Number(minutes)));
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rem = total % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

export function pnlToneClass(result: string | null | undefined, pnlPips: number | null): string {
  if (result === 'win' || (pnlPips != null && pnlPips > 0)) {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  if (result === 'loss' || (pnlPips != null && pnlPips < 0)) {
    return 'text-red-600 dark:text-red-400';
  }
  return 'text-slate-600 dark:text-slate-400';
}

export function foundingCellText(laneAdvisory: string | null | undefined): string {
  return formatFoundingSummary(parseAlphaOmegaFoundingMeta(laneAdvisory)) ?? '—';
}
