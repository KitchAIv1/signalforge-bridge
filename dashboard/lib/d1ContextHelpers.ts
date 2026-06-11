import type { D1MomentumSignal } from '@/lib/directionDecisionTypes';

export function formatD1MomentumSignal(signal: string | null): {
  label: string;
  status: 'pass' | 'warn' | 'neutral';
} {
  switch (signal) {
    case 'STRONG_CONTINUATION':
      return { label: 'Strong — body>60%, closed at extreme', status: 'warn' };
    case 'EXHAUSTION_BUILDING':
      return { label: 'Exhaustion — wick growing, body weak', status: 'pass' };
    case 'WEAK_CONTINUATION':
      return { label: 'Weak — indecisive close', status: 'neutral' };
    case 'NEUTRAL':
    default:
      return { label: 'Neutral', status: 'neutral' };
  }
}

export function formatD1Direction(direction: string | null, netPips: string | null): string {
  if (!direction || direction === 'equal') return 'Equal / flat';
  const pips = netPips ? ` (${Number(netPips) > 0 ? '+' : ''}${netPips}p)` : '';
  return `${direction.toUpperCase()}${pips}`;
}

export function formatD1ContextSummary(
  direction: string | null,
  netPips: string | null,
  bodyPct: string | null,
  momentumSignal: D1MomentumSignal | string | null,
): string {
  if (!direction) return '—';

  const directionLabel = formatD1Direction(direction, netPips);
  const bodyLabel = bodyPct ? `Body ${bodyPct}%` : '';
  const momentum = formatD1MomentumSignal(momentumSignal);
  const momentumPrefix = momentum.status === 'warn' ? '⚠ ' : '';

  return [directionLabel, bodyLabel, `${momentumPrefix}${momentum.label.split(' — ')[0]}`]
    .filter(Boolean)
    .join(' · ');
}

export const EMPTY_D1_CONTEXT_CONFIG = {
  d1_prior_direction: null,
  d1_prior_net_pips: null,
  d1_prior_body_pct: null,
  d1_prior_close_pos_pct: null,
  d1_momentum_signal: null,
} as const;
