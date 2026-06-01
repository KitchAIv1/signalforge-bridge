'use client';

import { useState } from 'react';
import type { AmdState } from '@/lib/types';
import type {
  AsianSessionVerdict,
  ChecklistRow,
  SessionPhase,
} from '@/lib/directionDecisionLogic';
import { DirectionChecklist } from '@/components/directionDecision/DirectionChecklist';
import { IconChevronDown } from '@/lib/directionDecisionTablerIcons';

interface AsianSessionSectionProps {
  phase: SessionPhase;
  verdict: AsianSessionVerdict;
  checklist: ChecklistRow[];
  amdState: AmdState | null;
}

function phaseLabel(phase: SessionPhase): string {
  if (phase === 'active') return 'IN PROGRESS';
  if (phase === 'completed') return 'COMPLETED';
  return 'PENDING';
}

function verdictToneClass(tone: AsianSessionVerdict['tone']): string {
  if (tone === 'complete') return 'text-emerald-700 dark:text-emerald-300';
  if (tone === 'skipped') return 'text-slate-600 dark:text-slate-400';
  if (tone === 'active') return 'text-blue-700 dark:text-blue-300';
  return 'text-amber-700 dark:text-amber-300';
}

function AsianDetailsPanel({ amdState }: { amdState: AmdState | null }) {
  if (!amdState) {
    return <p className="text-xs text-slate-500">No AMD state for investigation details.</p>;
  }
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
      <div>
        <dt className="text-slate-400">Asian range</dt>
        <dd>{amdState.asian_range_pips ?? '—'} pips</dd>
      </div>
      <div>
        <dt className="text-slate-400">Asian net</dt>
        <dd>{amdState.asian_net_pips ?? '—'} pips</dd>
      </div>
      <div>
        <dt className="text-slate-400">Judas pips</dt>
        <dd>{amdState.judas_pips ?? '—'}</dd>
      </div>
      <div>
        <dt className="text-slate-400">Evaluated</dt>
        <dd>{amdState.evaluated_at?.slice(11, 16) ?? '—'} UTC</dd>
      </div>
    </dl>
  );
}

export function AsianSessionSection({
  phase,
  verdict,
  checklist,
  amdState,
}: AsianSessionSectionProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <section className="border-b border-slate-200 px-4 py-4 dark:border-slate-700">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Asian session (00:00–08:00 UTC)
        </p>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Status: {phaseLabel(phase)}
        </span>
      </div>

      <div className="mb-3">
        <p className={`text-sm font-bold ${verdictToneClass(verdict.tone)}`}>{verdict.headline}</p>
        <p className="text-xs text-slate-600 dark:text-slate-300">{verdict.subline}</p>
      </div>

      <DirectionChecklist rows={checklist} />

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
          <AsianDetailsPanel amdState={amdState} />
        </div>
      )}
    </section>
  );
}
