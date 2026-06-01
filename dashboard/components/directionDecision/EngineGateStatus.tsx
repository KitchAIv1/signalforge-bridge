'use client';

import type { EngineGateRow, EngineGateState } from '@/lib/directionDecisionLogic';
import {
  IconCheck,
  IconClock,
  IconMinus,
  IconX,
} from '@/lib/directionDecisionTablerIcons';

interface EngineGateStatusProps {
  gateExplanation: string;
  engineGates: EngineGateRow[];
}

function gateIcon(state: EngineGateState) {
  if (state === 'armed' || state === 'active') {
    return <IconCheck size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />;
  }
  if (state === 'blocked') {
    return <IconX size={14} className="text-red-600 dark:text-red-400 shrink-0" />;
  }
  if (state === 'paused' || state === 'done') {
    return <IconMinus size={14} className="text-slate-400 shrink-0" />;
  }
  return <IconClock size={14} className="text-slate-400 shrink-0" />;
}

function gateStateLabel(state: EngineGateState): string {
  if (state === 'armed') return 'ARMED';
  if (state === 'active') return 'ACTIVE';
  if (state === 'blocked') return 'BLOCKED';
  if (state === 'paused') return 'PAUSED';
  if (state === 'done') return 'DONE';
  return 'SKIPPED';
}

export function EngineGateStatus({ gateExplanation, engineGates }: EngineGateStatusProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Gate result
      </p>
      <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">{gateExplanation}</p>
      <ul className="mt-2 space-y-1">
        {engineGates.map((gate) => (
          <li key={gate.engineId} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5">{gateIcon(gate.state)}</span>
            <span className="w-20 shrink-0 font-medium text-slate-600 dark:text-slate-300">
              {gate.label}:
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {gateStateLabel(gate.state)}
            </span>
            <span className="min-w-0 flex-1 text-slate-500 dark:text-slate-400">
              {gate.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
