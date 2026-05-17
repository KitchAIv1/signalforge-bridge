'use client';

import { useAmdState } from '@/hooks/useAmdState';
import { AmdPanelMetrics } from '@/components/AmdPanelMetrics';
import { AmdPanelLoading } from '@/components/AmdPanelLoading';
import { AmdPanelError } from '@/components/AmdPanelError';
import { AmdIntelManualTagOverride } from '@/components/AmdIntelManualTagOverride';

export function AmdPanel() {
  const { amdState, loading, error, refetch } = useAmdState();

  if (loading) return <AmdPanelLoading />;
  if (error) return <AmdPanelError message={error} />;

  const serverTag = amdState?.amd_tag ?? null;
  const manualSnippet = amdState?.amd_tag_manual_override?.trim() ?? '';
  const displayTag = manualSnippet !== '' ? manualSnippet : serverTag;

  return (
    <div className="mb-4 space-y-2">
      <AmdPanelMetrics amdState={amdState} displayTag={displayTag} />

      <div className="text-xs italic text-slate-500 dark:text-slate-400">
        Advisory only — no execution impact
      </div>

      <AmdIntelManualTagOverride amdState={amdState} refetch={refetch} />
    </div>
  );
}
