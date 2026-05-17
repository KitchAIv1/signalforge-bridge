'use client';

import { useAmdState } from '@/hooks/useAmdState';
import { AmdChart } from '@/components/AmdChart';
import { AmdPanelMetrics } from '@/components/AmdPanelMetrics';
import { AmdPanelLoading } from '@/components/AmdPanelLoading';
import { AmdPanelError } from '@/components/AmdPanelError';

export function AmdPanel() {
  const { amdState, loading, error } = useAmdState();

  if (loading) return <AmdPanelLoading />;
  if (error) return <AmdPanelError message={error} />;

  const serverTag = amdState?.amd_tag ?? null;
  const manualSnippet = amdState?.amd_tag_manual_override?.trim() ?? '';
  const displayTag = manualSnippet !== '' ? manualSnippet : serverTag;

  return (
    <div className="mb-4 space-y-2">
      <AmdPanelMetrics amdState={amdState} displayTag={displayTag} />

      {amdState && (
        <AmdChart amdState={amdState} onChartUrlSaved={() => void 0} />
      )}

      <div className="text-xs italic text-slate-600 dark:text-slate-300">
        Advisory only — no execution impact
      </div>
    </div>
  );
}
