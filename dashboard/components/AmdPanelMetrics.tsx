'use client';

import type { AmdState } from '@/lib/types';
import { amdSizeMultiplierLabel } from '@/lib/amdPanelFormatters';
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
          value={amdSizeMultiplierLabel(displayTag)}
        />
      </div>

      <AmdIntelCompressionRow amdState={amdState} />
    </>
  );
}
