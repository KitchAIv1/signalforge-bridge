'use client';

import type { AmdState } from '@/lib/types';
import {
  amdSizeMultiplierDisplay,
  autoDirectionLabel,
  autoDirectionColor,
  autoDirectionConfidenceLabel,
} from '@/lib/amdPanelFormatters';
import {
  describeAsianRangePips,
  describeReversalStatus,
  reversalAccentClass,
} from '@/lib/amdMetricPhrasing';
import { formatJudasSwingSummary } from '@/lib/formatJudasSwingSummary';
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

      {amdState?.auto_direction != null &&
        amdState.auto_direction !== 'neutral' && (
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Auto Direction
              </span>
              <span className={`font-semibold ${autoDirectionColor(amdState.auto_direction)}`}>
                {autoDirectionLabel(amdState.auto_direction)}
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                {autoDirectionConfidenceLabel(amdState.auto_direction_confidence)}
              </span>
              {amdState.auto_direction_reason != null &&
                amdState.auto_direction_reason !== '' && (
                  <span className="max-w-xs truncate italic text-slate-500 dark:text-slate-400">
                    {amdState.auto_direction_reason}
                  </span>
                )}
            </div>
          </div>
        )}

      <AmdIntelCompressionRow amdState={amdState} />
    </>
  );
}
