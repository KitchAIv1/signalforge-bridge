'use client';

import { computeRebuildDerivedStats } from '@/lib/rebuildShadowAggregates';
import { REBUILD_REFRESH_MS } from '@/lib/rebuildShadowConstants';
import { useRebuildShadowData } from '@/hooks/useRebuildShadowData';
import { RebuildShadowPageHeader } from '@/components/rebuild/RebuildShadowPageHeader';
import { RebuildShadowStatsBar } from '@/components/rebuild/RebuildShadowStatsBar';
import { RebuildShadowGateSection } from '@/components/rebuild/RebuildShadowGateSection';
import { RebuildShadowSessionTable } from '@/components/rebuild/RebuildShadowSessionTable';
import { RebuildShadowRBucketTable } from '@/components/rebuild/RebuildShadowRBucketTable';
import { RebuildShadowRecentTable } from '@/components/rebuild/RebuildShadowRecentTable';
import { RebuildShadowDailyChart } from '@/components/rebuild/RebuildShadowDailyChart';
import { RebuildSimulatedPnL } from '@/components/rebuild/RebuildSimulatedPnL';

export default function RebuildShadowPage() {
  const { signals, loading } = useRebuildShadowData();
  const derived = computeRebuildDerivedStats(signals);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-slate-500 text-sm">Loading rebuild shadow data…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <RebuildShadowPageHeader />
      <RebuildShadowStatsBar derived={derived} />
      <RebuildShadowGateSection derived={derived} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RebuildShadowSessionTable rows={derived.sessionRows} />
        <RebuildShadowRBucketTable rows={derived.rBucketRows} />
      </div>
      <RebuildSimulatedPnL signals={signals} />
      <RebuildShadowRecentTable signals={signals} />
      <RebuildShadowDailyChart series={derived.dailySeries} />
      <div className="text-xs text-slate-400 pb-4">
        Refreshes every {REBUILD_REFRESH_MS / 1000}s · rebuild_shadow_signals · read-only
      </div>
    </div>
  );
}
