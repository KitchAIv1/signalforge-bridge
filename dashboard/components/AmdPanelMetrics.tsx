'use client';

import type { AmdState } from '@/lib/types';
import {
  amdSizeMultiplierDisplay,
  autoDirectionLabel,
  autoDirectionColor,
  autoDirectionConfidenceLabel,
  m5SignalLabel,
  m5SignalColor,
  m5MomentumTypeLabel,
  m5MomentumTypeColor,
  judasTimingLabel,
  judasTimingColor,
  judasTimingConfirmRate,
} from '@/lib/amdPanelFormatters';
import {
  describeAsianRangePips,
  describeReversalStatus,
  reversalAccentClass,
} from '@/lib/amdMetricPhrasing';
import { formatJudasSwingSummary } from '@/lib/formatJudasSwingSummary';
import {
  asianCloseBiasColor,
  asianCloseBiasLabel,
  asianCloseFilterStatus,
} from '@/lib/asianCloseBiasHelpers';
import { AmdPanelAsianShapeFields } from '@/components/AmdPanelAsianShapeFields';
import { AmdIntelSectionHeading } from '@/components/AmdIntelSectionHeading';
import { AmdIntelPrimaryTag } from '@/components/AmdIntelPrimaryTag';
import { AmdIntelStatTile } from '@/components/AmdIntelStatTile';
import { AmdIntelCompressionRow } from '@/components/AmdIntelCompressionRow';
import { resolveEffectiveAutoDirection } from '@/lib/effectiveAutoDirection';

interface AmdPanelMetricsProps {
  amdState: AmdState | null;
  displayTag: string | null;
}

export function AmdPanelMetrics({ amdState, displayTag }: AmdPanelMetricsProps) {
  const ShadowPill = () => (
    <span className="ml-1 rounded px-1.5 py-0.5 text-xs font-semibold bg-yellow-900/20 text-yellow-500 dark:bg-yellow-900/30 dark:text-yellow-400">
      SHADOW
    </span>
  );

  const manualBadge =
    amdState != null && (amdState.amd_tag_manual_override ?? '').trim() !== '' ? (
      <span className="ml-2 text-xs font-medium text-amber-800 dark:text-amber-300">(manual override)</span>
    ) : null;

  const asianMetric = amdState != null ? describeAsianRangePips(amdState) : '—';
  const judasMetric = amdState != null ? formatJudasSwingSummary(amdState) : '—';
  const reversalMetric = amdState != null ? describeReversalStatus(amdState) : '—';
  const effectiveDirection = resolveEffectiveAutoDirection(amdState);
  const rawDirection = amdState?.auto_direction ?? null;
  const directionMismatch =
    rawDirection != null &&
    amdState?.decision_auto_direction != null &&
    rawDirection !== amdState.decision_auto_direction;

  return (
    <>
      <AmdIntelSectionHeading evaluatedAt={amdState?.evaluated_at ?? null} />

      <AmdIntelPrimaryTag displayTag={displayTag} manualOverrideSnippet={manualBadge} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <AmdIntelStatTile caption="Asian range" value={asianMetric} />
        <AmdIntelStatTile caption="Judas swing" value={judasMetric} />
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
          <p className="mb-1 text-xs text-muted-foreground">
            Judas Timing
            <ShadowPill />
          </p>
          <p className={`text-sm font-semibold ${judasTimingColor(amdState?.judas_timing)}`}>
            {judasTimingLabel(amdState?.judas_timing)}
          </p>
          {amdState?.judas_timing && (
            <p className="text-xs text-muted-foreground">
              {judasTimingConfirmRate(amdState.judas_timing)}
            </p>
          )}
        </div>
        <AmdIntelStatTile
          caption="Reversal"
          value={reversalMetric}
          accentClassName={reversalAccentClass(amdState)}
        />
        <AmdIntelStatTile
          caption="Size multiplier"
          value={amdSizeMultiplierDisplay(amdState?.amd_size_multiplier, displayTag)}
        />
      </div>

      {amdState != null && effectiveDirection != null && (
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Trade Direction
              </span>
              <span className={`font-bold text-sm ${autoDirectionColor(effectiveDirection)}`}>
                {autoDirectionLabel(effectiveDirection)}
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                {autoDirectionConfidenceLabel(amdState.auto_direction_confidence)}
              </span>
            </div>
            {directionMismatch && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Raw (pre-freeze): {autoDirectionLabel(rawDirection)}
              </p>
            )}
            {amdState.asian_close_bias_signal !== undefined && (
              <div className="mt-1 flex items-center gap-2">
                <span className="w-32 shrink-0 text-xs uppercase tracking-wide text-slate-500">
                  Asian Close Bias
                </span>
                <span className={`text-sm font-medium ${asianCloseBiasColor(amdState.asian_close_bias_signal)}`}>
                  {asianCloseBiasLabel(amdState.asian_close_bias_signal)}
                </span>
                {amdState.asian_close_position_pct != null && (
                  <span className="text-xs text-slate-400">
                    {amdState.asian_close_position_pct.toFixed(1)}%
                  </span>
                )}
                {(() => {
                  const status = asianCloseFilterStatus(
                    amdState.asian_close_bias_signal,
                    effectiveDirection,
                  );
                  return status ? (
                    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${status.color}`}>
                      {status.label}
                    </span>
                  ) : null;
                })()}
              </div>
            )}
            {amdState.accumulation_quality_score != null && (
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Accum. Quality
                  <ShadowPill />
                </span>
                <span className={
                  amdState.accumulation_quality_score >= 0.65 ? 'text-green-600' :
                  amdState.accumulation_quality_score >= 0.45 ? 'text-yellow-600' :
                  'text-muted-foreground'
                }>
                  {Math.round(amdState.accumulation_quality_score * 100)}%
                </span>
              </div>
            )}
            <AmdPanelAsianShapeFields amdState={amdState} />
            <p className="mt-1 max-w-xs truncate text-xs italic text-slate-500 dark:text-slate-400">
              {amdState.auto_direction_reason !== '' &&
              amdState.auto_direction_reason != null
                ? amdState.auto_direction_reason
                : 'No directional signal — direction unchanged'}
            </p>
          </div>
        )}

      {amdState?.m5_vs_judas_direction != null && (
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              M5 Signal
            </span>
            <span
              className={`font-bold text-sm ${m5SignalColor(amdState.m5_vs_judas_direction)}`}
            >
              {m5SignalLabel(amdState.m5_vs_judas_direction)}
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              {amdState.m5_first_3_net_pips != null
                ? `${amdState.m5_first_3_net_pips > 0 ? '+' : ''}${amdState.m5_first_3_net_pips.toFixed(1)} pips net`
                : ''}
            </span>
            {amdState.m5_evaluated_at != null && (
              <span className="italic text-slate-400">
                {`evaluated ${new Date(amdState.m5_evaluated_at).getUTCHours().toString().padStart(2, '0')}:${new Date(amdState.m5_evaluated_at).getUTCMinutes().toString().padStart(2, '0')} UTC`}
              </span>
            )}
          </div>
          {amdState.m5_momentum_type && (
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-muted-foreground">
                Momentum
                <ShadowPill />
              </span>
              <span className={m5MomentumTypeColor(amdState.m5_momentum_type)}>
                {m5MomentumTypeLabel(amdState.m5_momentum_type)}
                {amdState.m5_w2_net_pips != null && (
                  <span className="text-muted-foreground ml-1">
                    ({amdState.m5_w2_net_pips > 0 ? '+' : ''}{amdState.m5_w2_net_pips.toFixed(1)}p W2)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      <AmdIntelCompressionRow amdState={amdState} />
    </>
  );
}
