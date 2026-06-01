'use client';

import { useEffect, useState } from 'react';
import { useDirectionDecisionData } from '@/hooks/useDirectionDecisionData';
import { AsianSessionSection } from '@/components/directionDecision/AsianSessionSection';
import { DistributionSignalsSection } from '@/components/directionDecision/DistributionSignalsSection';
import { EngineGateSection } from '@/components/directionDecision/EngineGateSection';

function formatPanelDate(isoDate: string): string {
  const stamp = new Date(`${isoDate}T12:00:00Z`);
  return stamp.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatUpdatedUtc(stamp: Date): string {
  return `${stamp.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
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
  const { snapshot, amdState, regimeState, scalperDayState, verificationStatus, loading, error } =
    useDirectionDecisionData();
  const [lastUpdatedUtc, setLastUpdatedUtc] = useState('');

  useEffect(() => {
    if (snapshot && !loading) {
      setLastUpdatedUtc(formatUpdatedUtc(new Date()));
    }
  }, [snapshot, loading]);

  if (loading && !snapshot) return <DirectionDecisionLoading />;
  if (error && !snapshot) return <DirectionDecisionError message={error} />;
  if (!snapshot) return <DirectionDecisionError message="No snapshot available" />;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-800 dark:text-slate-100">
            {formatPanelDate(snapshot.tradeDate)} — AUDUSD direction intelligence
          </h2>
          {lastUpdatedUtc && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Updated {lastUpdatedUtc}
            </span>
          )}
        </div>
        {error && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            Refresh warning: {error}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AsianSessionSection
          phase={snapshot.asianPhase}
          verdict={snapshot.asianVerdict}
          checklist={snapshot.asianChecklist}
          amdState={amdState}
        />

        <DistributionSignalsSection
          phase={snapshot.distributionPhase}
          checklist={snapshot.distributionChecklist}
          alignment={snapshot.alignment}
          amdState={amdState}
          regimeState={regimeState}
        />

        <div className="md:col-span-2 lg:col-span-1">
          <EngineGateSection
            phase={snapshot.distributionPhase}
            verdict={snapshot.distributionVerdict}
            gateExplanation={snapshot.gateExplanation}
            engineGates={snapshot.engineGates}
            scalperDayState={scalperDayState}
            scalperSummary={snapshot.scalperSummary}
            verificationStatus={verificationStatus}
          />
        </div>
      </div>
    </div>
  );
}
