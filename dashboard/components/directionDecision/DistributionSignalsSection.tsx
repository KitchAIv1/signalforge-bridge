'use client';

import { useState } from 'react';
import type { AmdState, RegimeState } from '@/lib/types';
import type { AlignmentSummary, ChecklistRow, SessionPhase } from '@/lib/directionDecisionLogic';
import { DirectionChecklist } from '@/components/directionDecision/DirectionChecklist';
import { SignalAlignmentBadge } from '@/components/directionDecision/SignalAlignmentBadge';
import { IconChevronDown } from '@/lib/directionDecisionTablerIcons';
import {
  DIRECTION_COLUMN_CARD_CLASS,
  sessionStatusBadgeClass,
} from '@/components/directionDecision/directionDecisionLayout';

interface DistributionSignalsSectionProps {
  phase: SessionPhase;
  checklist: ChecklistRow[];
  alignment: AlignmentSummary;
  amdState: AmdState | null;
  regimeState: RegimeState | null;
}

function phaseLabel(phase: SessionPhase): string {
  if (phase === 'active') return 'ACTIVE';
  if (phase === 'completed') return 'COMPLETED';
  return 'PENDING';
}

function DistributionDetailsPanel({
  amdState,
  regimeState,
}: {
  amdState: AmdState | null;
  regimeState: RegimeState | null;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
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

export function DistributionSignalsSection({
  phase,
  checklist,
  alignment,
  amdState,
  regimeState,
}: DistributionSignalsSectionProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <section className={DIRECTION_COLUMN_CARD_CLASS}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Distribution signals
        </p>
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sessionStatusBadgeClass(phase)}`}
        >
          {phaseLabel(phase)}
        </span>
      </div>

      <p className="mb-3 text-[10px] text-slate-400 dark:text-slate-500">10:00–16:00 UTC</p>

      <div className="flex-1 space-y-3">
        <DirectionChecklist rows={checklist} />
        <SignalAlignmentBadge alignment={alignment} />
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
