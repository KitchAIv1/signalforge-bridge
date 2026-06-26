'use client';

import { asianCloseBiasColor, asianCloseBiasLabel } from '@/lib/asianCloseBiasHelpers';
import {
  resolveAsianSessionAmdMetricsDisplayState,
  type AsianSessionAmdMetricsSlice,
} from '@/lib/asianSessionAmdMetricsTypes';
import {
  asianShapeLabel,
  formatAsianTurnPosition,
  formatAsianTurnTimeUtc,
} from '@/lib/asianShapeFormatters';

interface AsianSessionAmdMetricsCellProps {
  tradeDate: string;
  metrics: AsianSessionAmdMetricsSlice | undefined;
}

function ShadowTag() {
  return (
    <span className="rounded bg-yellow-900/20 px-1 py-0.5 text-[10px] font-semibold text-yellow-600 dark:text-yellow-400">
      SHADOW
    </span>
  );
}

function formatAccumQualityScore(score: number | null | undefined): string {
  if (score == null) return '—';
  return `${Math.round(score * 100)}%`;
}

function formatCloseBiasLine(metrics: AsianSessionAmdMetricsSlice): string {
  if (!metrics.asian_close_bias_signal) return 'Close: —';
  const positionLabel =
    metrics.asian_close_position_pct != null
      ? ` ${metrics.asian_close_position_pct.toFixed(1)}%`
      : '';
  return `Close: ${asianCloseBiasLabel(metrics.asian_close_bias_signal)}${positionLabel}`;
}

function PendingMetricsMessage() {
  return (
    <span className="text-xs italic text-slate-400 dark:text-slate-500">
      AMD pending (10:31 UTC)
    </span>
  );
}

function MissingMetricsMessage() {
  return <span className="text-xs text-slate-400 dark:text-slate-500">No AMD row</span>;
}

function ReadyMetricsContent({ metrics }: { metrics: AsianSessionAmdMetricsSlice }) {
  const turnLabel =
    metrics.asian_turn_time != null || metrics.asian_turn_position != null
      ? `${formatAsianTurnTimeUtc(metrics.asian_turn_time)} · ${formatAsianTurnPosition(metrics.asian_turn_position)}`
      : '—';

  return (
    <div className="space-y-0.5 text-xs leading-snug">
      <p className={asianCloseBiasColor(metrics.asian_close_bias_signal)}>
        {formatCloseBiasLine(metrics)}
      </p>
      <p className="text-slate-600 dark:text-slate-400">
        <span className="text-slate-500">Accum</span> {formatAccumQualityScore(metrics.accumulation_quality_score)}{' '}
        <ShadowTag />
        <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
        <span className="text-slate-500">Shape</span>{' '}
        <span className="capitalize">{asianShapeLabel(metrics.asian_shape)}</span>{' '}
        <ShadowTag />
      </p>
      <p className="text-slate-600 dark:text-slate-400">
        <span className="text-slate-500">Retr</span>{' '}
        {metrics.asian_retracement_pct != null ? `${metrics.asian_retracement_pct.toFixed(1)}%` : '—'}{' '}
        <ShadowTag />
        <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
        <span className="text-slate-500">Turn</span> {turnLabel} <ShadowTag />
      </p>
    </div>
  );
}

export function AsianSessionAmdMetricsCell({ tradeDate, metrics }: AsianSessionAmdMetricsCellProps) {
  const displayState = resolveAsianSessionAmdMetricsDisplayState(tradeDate, metrics);

  if (displayState === 'pending') return <PendingMetricsMessage />;
  if (displayState === 'missing') return <MissingMetricsMessage />;
  if (!metrics) return <MissingMetricsMessage />;
  return <ReadyMetricsContent metrics={metrics} />;
}
