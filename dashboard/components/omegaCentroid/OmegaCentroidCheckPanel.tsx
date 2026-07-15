'use client';

import { OmegaCentroidHealthStrip } from '@/components/omegaCentroid/OmegaCentroidHealthStrip';
import { OmegaCentroidRecentFires } from '@/components/omegaCentroid/OmegaCentroidRecentFires';
import { OmegaCentroidTemplateCard } from '@/components/omegaCentroid/OmegaCentroidTemplateCard';
import { useOmegaCentroidHealth } from '@/hooks/useOmegaCentroidHealth';

export function OmegaCentroidCheckPanel() {
  const { fires, stats, loading, errorMessage } = useOmegaCentroidHealth();

  return (
    <div className="space-y-4">
      <EnvThresholdCallout />
      {errorMessage ? (
        <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          Shadow telemetry: {errorMessage}
        </p>
      ) : null}
      <OmegaCentroidTemplateCard />
      <OmegaCentroidHealthStrip stats={stats} isLoading={loading} />
      <OmegaCentroidRecentFires fires={fires} isLoading={loading} />
      <p className="text-[11px] text-slate-500">
        Phase 1 check only — refreshes every 30s. No edits, no matcher changes.
      </p>
    </div>
  );
}

function EnvThresholdCallout() {
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
      <p className="font-medium text-amber-900 dark:text-amber-200">
        Threshold footgun (ops)
      </p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
        Engine default threshold is 7.737647. If Railway still has{' '}
        <span className="font-mono">OMEGA_SHADOW_MATCH_THRESHOLD=3.230575</span>{' '}
        (legacy w3/c5), matches starve. This UI cannot read Railway env — verify
        on the engine host. Distances below are vs the default thr.
      </p>
    </div>
  );
}
