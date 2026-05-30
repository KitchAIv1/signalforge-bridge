'use client';

import type { AmdState } from '@/lib/types';
import {
  amdSizeMultiplierDisplay,
  autoDirectionLabel,
  autoDirectionColor,
  autoDirectionConfidenceLabel,
  m5SignalLabel,
  m5SignalColor,
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
import { AmdIntelSectionHeading } from '@/components/AmdIntelSectionHeading';
import { AmdIntelPrimaryTag } from '@/components/AmdIntelPrimaryTag';
import { AmdIntelStatTile } from '@/components/AmdIntelStatTile';
import { AmdIntelCompressionRow } from '@/components/AmdIntelCompressionRow';

interface AmdPanelMetricsProps {
  amdState: AmdState | null;
  displayTag: string | null;
}

export function AmdPanelMetrics({ amdState, displayTag }: AmdPanelMetricsProps) {
  const manualBadge =
    amdState != null && (amdState.amd_tag_manual_override ?? '').trim() !== '' ? (
      <span className="ml-2 text-xs font-medium text-amber-800 dark:text-amber-300">(manual override)</span>
    ) : null;

  const asianMetric = amdState != null ? describeAsianRangePips(amdState) : '—';
  const judasMetric = amdState != null ? formatJudasSwingSummary(amdState) : '—';
  const reversalMetric = amdState != null ? describeReversalStatus(amdState) : '—';

  return (
    <>
      <AmdIntelSectionHeading evaluatedAt={amdState?.evaluated_at ?? null} />

      <AmdIntelPrimaryTag displayTag={displayTag} manualOverrideSnippet={manualBadge} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <AmdIntelStatTile caption="Asian range" value={asianMetric} />
        <AmdIntelStatTile caption="Judas swing" value={judasMetric} />
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

      {amdState?.auto_direction != null && (
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Auto Direction
              </span>
              <span className={`font-bold text-sm ${autoDirectionColor(amdState.auto_direction)}`}>
                {autoDirectionLabel(amdState.auto_direction)}
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                {autoDirectionConfidenceLabel(amdState.auto_direction_confidence)}
              </span>
            </div>
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
                    amdState.auto_direction,
                  );
                  return status ? (
                    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${status.color}`}>
                      {status.label}
                    </span>
                  ) : null;
                })()}
              </div>
            )}
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
        </div>
      )}

      <AmdIntelCompressionRow amdState={amdState} />
    </>
  );
}
