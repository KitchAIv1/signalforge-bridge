'use client';

import { OmegaExitReferenceOverview } from '@/components/omegaExitReference/OmegaExitReferenceOverview';
import { OmegaExitReferenceTrailTable } from '@/components/omegaExitReference/OmegaExitReferenceTrailTable';
import { OmegaExitReferenceExitPaths } from '@/components/omegaExitReference/OmegaExitReferenceExitPaths';
import { OmegaExitReferenceAmdGateTable } from '@/components/omegaExitReference/OmegaExitReferenceAmdGateTable';
import { OmegaExitReferenceAsianTable } from '@/components/omegaExitReference/OmegaExitReferenceAsianTable';
import { OmegaExitReferenceWindowTable } from '@/components/omegaExitReference/OmegaExitReferenceWindowTable';

export function OmegaExitReferenceContent() {
  return (
    <div className="flex flex-col gap-8 px-6 py-5">
      <OmegaExitReferenceOverview />
      <OmegaExitReferenceTrailTable />
      <OmegaExitReferenceExitPaths />
      <OmegaExitReferenceAsianTable />
      <OmegaExitReferenceAmdGateTable />
      <OmegaExitReferenceWindowTable />
      <div className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3 dark:border-violet-900/70 dark:bg-violet-950/20">
        <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
          Operator note: Omega exit is bridge-managed (R-trail). AMD distribution uses pip-trail +
          optional time gate on engine_amd. Asian session sets direction and forces 08:00 UTC close
          sweep. Read close_reason on Activity trades to see which path fired.
        </p>
      </div>
      <p className="text-right text-xs text-slate-400 dark:text-slate-600">
        Omega Exit Strategy Reference - SignalForge / Veredix - Updated 2026-05-28
      </p>
    </div>
  );
}
