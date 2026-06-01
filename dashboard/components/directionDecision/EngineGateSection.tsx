'use client';

import type { ScalperDayState } from '@/lib/types';
import type {
  DistributionVerdict,
  EngineGateRow,
  EngineGateState,
  ScalperTradeSummary,
  SessionPhase,
} from '@/lib/directionDecisionLogic';
import { ScalperDetailStrip } from '@/components/directionDecision/ScalperDetailStrip';
import { DecisionVerificationRow } from '@/components/directionDecision/DecisionVerificationRow';
import type { DecisionVerificationProps } from '@/components/directionDecision/DecisionVerificationRow';
import {
  IconCheck,
  IconClock,
  IconMinus,
  IconX,
} from '@/lib/directionDecisionTablerIcons';
import { DIRECTION_COLUMN_CARD_CLASS } from '@/components/directionDecision/directionDecisionLayout';

interface EngineGateSectionProps {
  phase: SessionPhase;
  verdict: DistributionVerdict;
  gateExplanation: string;
  engineGates: EngineGateRow[];
  scalperDayState: ScalperDayState | null;
  scalperSummary: ScalperTradeSummary;
  verificationStatus: DecisionVerificationProps;
}

function verdictBannerClass(tone: DistributionVerdict['tone'], phase: SessionPhase): string {
  if (phase === 'completed' && tone !== 'armed') {
    return 'border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800/80';
  }
  if (tone === 'armed') {
    return 'border-emerald-300 bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/30';
  }
  if (tone === 'blocked') {
    return 'border-amber-300 bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30';
  }
  return 'border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800/80';
}

function gateIcon(state: EngineGateState) {
  if (state === 'armed' || state === 'active') {
    return <IconCheck size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />;
  }
  if (state === 'blocked') {
    return <IconX size={14} className="shrink-0 text-red-600 dark:text-red-400" />;
  }
  if (state === 'paused' || state === 'done') {
    return <IconMinus size={14} className="shrink-0 text-slate-400" />;
  }
  return <IconClock size={14} className="shrink-0 text-slate-400" />;
}

function gateStateLabel(state: EngineGateState): string {
  if (state === 'armed') return 'ARMED';
  if (state === 'active') return 'ACTIVE';
  if (state === 'blocked') return 'BLOCKED';
  if (state === 'paused') return 'PAUSED';
  if (state === 'done') return 'DONE';
  return 'SKIPPED';
}

export function EngineGateSection({
  phase,
  verdict,
  gateExplanation,
  engineGates,
  scalperDayState,
  scalperSummary,
  verificationStatus,
}: EngineGateSectionProps) {
  return (
    <section className={DIRECTION_COLUMN_CARD_CLASS}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Engine gates
      </p>

      <div className={`mb-3 rounded-lg border px-3 py-3 ${verdictBannerClass(verdict.tone, phase)}`}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Verdict
        </p>
        <p className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">{verdict.headline}</p>
        <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">{verdict.subline}</p>
      </div>

      <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">{gateExplanation}</p>

      <ul className="mb-3 space-y-1.5">
        {engineGates.map((gate) => (
          <li key={gate.engineId} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5">{gateIcon(gate.state)}</span>
            <span className="w-[4.5rem] shrink-0 font-medium text-slate-600 dark:text-slate-300">
              {gate.label}
            </span>
            <span className="w-16 shrink-0 font-semibold text-slate-800 dark:text-slate-100">
              {gateStateLabel(gate.state)}
            </span>
            <span className="min-w-0 flex-1 text-slate-500 dark:text-slate-400">{gate.detail}</span>
          </li>
        ))}
      </ul>

      <ScalperDetailStrip
        scalperDayState={scalperDayState}
        tradeSummary={scalperSummary}
        visible
      />

      <DecisionVerificationRow
        liveDirection={verificationStatus.liveDirection}
        reconstructedDirection={verificationStatus.reconstructedDirection}
        match={verificationStatus.match}
        available={verificationStatus.available}
      />
    </section>
  );
}
