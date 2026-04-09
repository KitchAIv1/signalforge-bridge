'use client';

import { computeOmegaDerivedStats } from '@/lib/omegaShadowAggregates';
import { REFRESH_MS } from '@/lib/omegaShadowConstants';
import { useOmegaShadowData } from '@/hooks/useOmegaShadowData';
import { OmegaShadowPageHeader } from '@/components/omega/OmegaShadowPageHeader';
import { OmegaShadowStatsGrid } from '@/components/omega/OmegaShadowStatsGrid';
import { OmegaShadowOutcomesSpread } from '@/components/omega/OmegaShadowOutcomesSpread';
import { OmegaShadowBreakdownTables } from '@/components/omega/OmegaShadowBreakdownTables';
import { OmegaShadowGateTracker } from '@/components/omega/OmegaShadowGateTracker';
import { OmegaShadowRecentSignals } from '@/components/omega/OmegaShadowRecentSignals';
import { OmegaShadowWeeklyReportCard } from '@/components/omega/OmegaShadowWeeklyReportCard';

export default function OmegaShadowPage() {
  const { signals, weeklyReport, loading } = useOmegaShadowData();
  const derived = computeOmegaDerivedStats(signals);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-slate-500 text-sm">Loading Omega shadow data…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <OmegaShadowPageHeader />
      <OmegaShadowStatsGrid derived={derived} />
      <OmegaShadowOutcomesSpread derived={derived} />
      <OmegaShadowBreakdownTables derived={derived} />
      <OmegaShadowGateTracker derived={derived} />
      <OmegaShadowRecentSignals signals={signals} />
      {weeklyReport && (
        <OmegaShadowWeeklyReportCard weeklyReport={weeklyReport} />
      )}
      <div className="text-xs text-slate-400 pb-4">
        Refreshes every {REFRESH_MS / 1000}s · omega_phase2_approved = false ·
        bridge execution disabled
      </div>
    </div>
  );
}
