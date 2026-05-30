export function asianCloseBiasLabel(signal: string | null | undefined): string {
  if (signal === 'BULLISH') return '↑ BULLISH';
  if (signal === 'BEARISH') return '↓ BEARISH';
  if (signal === 'NEUTRAL') return '— NEUTRAL';
  return '—';
}

export function asianCloseBiasColor(signal: string | null | undefined): string {
  if (signal === 'BULLISH') return 'text-emerald-600 dark:text-emerald-400';
  if (signal === 'BEARISH') return 'text-red-600 dark:text-red-400';
  return 'text-slate-400';
}

export function asianCloseFilterStatus(
  signal: string | null | undefined,
  autoDirection: string | null | undefined,
): { label: string; color: string } | null {
  if (!signal || signal === 'NEUTRAL' || !autoDirection) return null;
  if (autoDirection === 'neutral') return null;
  const biasDir = signal === 'BULLISH' ? 'long' : 'short';
  const agree = biasDir === autoDirection;
  return agree
    ? { label: 'AGREE', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' }
    : { label: 'DISAGREE', color: 'text-red-600 bg-red-50 dark:bg-red-900/20' };
}
