'use client';

import { useAmdState } from '@/hooks/useAmdState';
import { AmdChart } from '@/components/AmdChart';
import { AmdPanelMetrics } from '@/components/AmdPanelMetrics';
import { AmdPanelLoading } from '@/components/AmdPanelLoading';
import { AmdPanelError } from '@/components/AmdPanelError';

interface AmdPanelProps {
  /** Compact mode: show metrics tiles only, hide the chart (used when chart lives on AMD page). */
  compact?: boolean;
}

export function AmdPanel({ compact = false }: AmdPanelProps) {
  const { amdState, loading, error } = useAmdState();

  if (loading) return <AmdPanelLoading />;
  if (error) return <AmdPanelError message={error} />;

  const serverTag = amdState?.amd_tag ?? null;
  const manualSnippet = amdState?.amd_tag_manual_override?.trim() ?? '';
  const displayTag = manualSnippet !== '' ? manualSnippet : serverTag;

  if (compact) {
    return (
      <div className="space-y-2">
        <AmdPanelMetrics amdState={amdState} displayTag={displayTag} />
        <div className="text-xs italic text-slate-600 dark:text-slate-300">
          Advisory only — no execution impact
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <AmdPanelMetrics amdState={amdState} displayTag={displayTag} />
          <div className="text-xs italic text-slate-600 dark:text-slate-300">
            Advisory only — no execution impact
          </div>
        </div>
        <div>
          {amdState && (
            <AmdChart amdState={amdState} onChartUrlSaved={() => void 0} />
          )}
          {!amdState && (
            <div className="flex h-full min-h-[200px] items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
              <p className="text-sm text-slate-400">No AMD data for today</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
