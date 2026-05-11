/**
 * Pure formatting helpers for RegimePanel.
 * No imports, no side effects.
 */

export function formatUTCTime(isoString: string): string {
  return new Date(isoString).toUTCString().slice(17, 22) + ' UTC';
}

export function computeNextUpdateUTC(evaluatedAt: string): string {
  const next = new Date(new Date(evaluatedAt).getTime() + 4 * 60 * 60 * 1000);
  return next.toUTCString().slice(17, 22) + ' UTC';
}

export function layer4Label(
  result: string,
  bullishCount: number,
  bearishCount: number
): { symbol: string; label: string; detail: string } {
  const detail = `${bullishCount}b / ${bearishCount}br`;
  if (result === 'TRENDING_UP')   return { symbol: '↑', label: 'Trending up',   detail };
  if (result === 'TRENDING_DOWN') return { symbol: '↓', label: 'Trending down', detail };
  return { symbol: '→', label: 'Ranging', detail };
}

export function layer5Label(
  result: string,
  pipDiff: number
): { symbol: string; label: string; detail: string } {
  const sign   = pipDiff >= 0 ? '+' : '';
  const detail = `${sign}${pipDiff} pips`;
  if (result === 'BULLISH') return { symbol: '↑', label: 'Bullish', detail };
  if (result === 'BEARISH') return { symbol: '↓', label: 'Bearish', detail };
  return { symbol: '→', label: 'Neutral', detail };
}

export function layer6Label(positionPct: number): { label: string; detail: string } {
  if (positionPct >= 70) return { label: `${positionPct}%`, detail: 'Near range high' };
  if (positionPct <= 30) return { label: `${positionPct}%`, detail: 'Near range low' };
  return { label: `${positionPct}%`, detail: 'Mid range' };
}

export function confidenceColorClass(confidence: string): string {
  if (confidence === 'HIGH')   return 'text-green-600 dark:text-green-400';
  if (confidence === 'MEDIUM') return 'text-yellow-600 dark:text-yellow-400';
  if (confidence === 'LOW')    return 'text-orange-500 dark:text-orange-400';
  return 'text-slate-400';
}

export type AlertVariant = 'ok' | 'warn' | 'conflict';

export function computeAlertVariant(
  confidence: string,
  regimeDir:  string,
  omegaDir:   string | null
): AlertVariant {
  if (
    regimeDir !== 'PAUSE' &&
    omegaDir &&
    regimeDir.toLowerCase() !== omegaDir.toLowerCase()
  ) return 'conflict';
  if (confidence === 'HIGH') return 'ok';
  return 'warn';
}

export function alertMessage(
  variant:    AlertVariant,
  confidence: string,
  regimeDir:  string,
  omegaDir:   string | null
): string {
  if (variant === 'conflict') {
    return `Regime suggests ${regimeDir} but omega is set to ${(omegaDir ?? '').toUpperCase()} — consider flipping.`;
  }
  if (variant === 'ok') {
    return `Regime aligned — ${confidence} confidence ${regimeDir}.`;
  }
  return `Confidence is ${confidence} — all signals executing at full size. Override direction if needed.`;
}

export function alertClasses(variant: AlertVariant): { bg: string; text: string } {
  if (variant === 'ok')       return { bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',  text: 'text-green-700 dark:text-green-400'  };
  if (variant === 'conflict') return { bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',         text: 'text-red-700 dark:text-red-400'      };
  return                             { bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800', text: 'text-yellow-700 dark:text-yellow-400' };
}
