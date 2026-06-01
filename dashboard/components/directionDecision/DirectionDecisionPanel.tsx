'use client';

import { useDirectionDecisionData } from '@/hooks/useDirectionDecisionData';
import { AsianSessionSection } from '@/components/directionDecision/AsianSessionSection';
import { DistributionSessionSection } from '@/components/directionDecision/DistributionSessionSection';

function formatPanelDate(isoDate: string): string {
  const stamp = new Date(`${isoDate}T12:00:00Z`);
  return stamp.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function DirectionDecisionLoading() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
      Loading direction intelligence…
    </div>
  );
}

function DirectionDecisionError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
      Direction panel: {message}
    </div>
  );
}

export function DirectionDecisionPanel() {
  const { snapshot, amdState, regimeState, scalperDayState, loading, error } =
    useDirectionDecisionData();

  if (loading && !snapshot) return <DirectionDecisionLoading />;
  if (error && !snapshot) return <DirectionDecisionError message={error} />;
  if (!snapshot) return <DirectionDecisionError message="No snapshot available" />;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-800 dark:text-slate-100">
          {formatPanelDate(snapshot.tradeDate)} — AUDUSD direction intelligence
        </h2>
        {error && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            Refresh warning: {error}
          </p>
        )}
      </div>

      <AsianSessionSection
        phase={snapshot.asianPhase}
        verdict={snapshot.asianVerdict}
        checklist={snapshot.asianChecklist}
        amdState={amdState}
      />

      <DistributionSessionSection
        phase={snapshot.distributionPhase}
        verdict={snapshot.distributionVerdict}
        checklist={snapshot.distributionChecklist}
        alignment={snapshot.alignment}
        gateExplanation={snapshot.gateExplanation}
        engineGates={snapshot.engineGates}
        scalperDayState={scalperDayState}
        scalperSummary={snapshot.scalperSummary}
        amdState={amdState}
        regimeState={regimeState}
      />
    </div>
  );
}
