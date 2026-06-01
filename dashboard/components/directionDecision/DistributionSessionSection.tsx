'use client';

import { useState } from 'react';
import type { AmdState, RegimeState, ScalperDayState } from '@/lib/types';
import type {
  AlignmentSummary,
  ChecklistRow,
  DistributionVerdict,
  EngineGateRow,
  ScalperTradeSummary,
  SessionPhase,
} from '@/lib/directionDecisionLogic';
import { DirectionChecklist } from '@/components/directionDecision/DirectionChecklist';
import { SignalAlignmentBadge } from '@/components/directionDecision/SignalAlignmentBadge';
import { EngineGateStatus } from '@/components/directionDecision/EngineGateStatus';
import { ScalperDetailStrip } from '@/components/directionDecision/ScalperDetailStrip';
import { IconChevronDown } from '@/lib/directionDecisionTablerIcons';

interface DistributionSessionSectionProps {
  phase: SessionPhase;
  verdict: DistributionVerdict;
  checklist: ChecklistRow[];
  alignment: AlignmentSummary;
  gateExplanation: string;
  engineGates: EngineGateRow[];
  scalperDayState: ScalperDayState | null;
  scalperSummary: ScalperTradeSummary;
  amdState: AmdState | null;
  regimeState: RegimeState | null;
}

function phaseLabel(phase: SessionPhase): string {
  if (phase === 'active') return 'ACTIVE';
  if (phase === 'completed') return 'COMPLETED';
  return 'PENDING';
}

function verdictBannerClass(tone: DistributionVerdict['tone']): string {
  if (tone === 'armed') {
    return 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20';
  }
  if (tone === 'blocked') {
    return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20';
  }
  if (tone === 'pending') {
    return 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40';
  }
  return 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20';
}

function DistributionDetailsPanel({
  amdState,
  regimeState,
}: {
  amdState: AmdState | null;
  regimeState: RegimeState | null;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3">
      <div>
        <dt className="text-slate-400">Judas pips</dt>
        <dd>{amdState?.judas_pips ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-slate-400">Asian close %</dt>
        <dd>{amdState?.asian_close_position_pct?.toFixed(1) ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-slate-400">M5 net (first 3)</dt>
        <dd>{amdState?.m5_first_3_net_pips ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-slate-400">Auto reason</dt>
        <dd className="truncate">{amdState?.auto_direction_reason ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-slate-400">Regime L5</dt>
        <dd>{regimeState?.layer5_result ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-slate-400">Size multiplier</dt>
        <dd>{amdState?.amd_size_multiplier ?? '—'}</dd>
      </div>
    </dl>
  );
}

function scalperStripVisible(
  engineGates: EngineGateRow[],
  scalperDayState: ScalperDayState | null,
): boolean {
  const scalperGate = engineGates.find((gate) => gate.engineId === 'scalper');
  if (scalperGate?.state === 'armed' || scalperGate?.state === 'active') return true;
  if (scalperDayState?.reference_price != null) return true;
  return false;
}

export function DistributionSessionSection({
  phase,
  verdict,
  checklist,
  alignment,
  gateExplanation,
  engineGates,
  scalperDayState,
  scalperSummary,
  amdState,
  regimeState,
}: DistributionSessionSectionProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const showScalper = scalperStripVisible(engineGates, scalperDayState);

  return (
    <section className="px-4 py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Distribution session (10:00–16:00 UTC)
        </p>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Status: {phaseLabel(phase)}
        </span>
      </div>

      <div className={`mb-3 rounded-lg border px-3 py-2 ${verdictBannerClass(verdict.tone)}`}>
        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{verdict.headline}</p>
        <p className="text-xs text-slate-600 dark:text-slate-300">{verdict.subline}</p>
      </div>

      <div className="space-y-3">
        <DirectionChecklist rows={checklist} />
        <SignalAlignmentBadge alignment={alignment} />
        <EngineGateStatus gateExplanation={gateExplanation} engineGates={engineGates} />
        <ScalperDetailStrip
          scalperDayState={scalperDayState}
          tradeSummary={scalperSummary}
          visible={showScalper}
        />
      </div>

      <button
        type="button"
        onClick={() => setDetailsOpen((open) => !open)}
        className="mt-3 flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <IconChevronDown
          size={14}
          className={`transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
        />
        {detailsOpen ? 'Hide details' : 'Show details'}
      </button>
      {detailsOpen && (
        <div className="mt-2 rounded border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
          <DistributionDetailsPanel amdState={amdState} regimeState={regimeState} />
        </div>
      )}
    </section>
  );
}
