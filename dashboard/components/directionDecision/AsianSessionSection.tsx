'use client';

import { useState } from 'react';
import type { AmdState } from '@/lib/types';
import type {
  AsianSessionVerdict,
  ChecklistRow,
  SessionPhase,
} from '@/lib/directionDecisionLogic';
import type { AsianSessionDetection } from '@/lib/directionDecisionTypes';
import { DirectionChecklist } from '@/components/directionDecision/DirectionChecklist';
import { IconChevronDown } from '@/lib/directionDecisionTablerIcons';
import {
  DIRECTION_COLUMN_CARD_CLASS,
  sessionStatusBadgeClass,
} from '@/components/directionDecision/directionDecisionLayout';

interface AsianSessionSectionProps {
  phase: SessionPhase;
  verdict: AsianSessionVerdict;
  checklist: ChecklistRow[];
  amdState: AmdState | null;
  activeDetection?: AsianSessionDetection | null;
}

function phaseLabel(phase: SessionPhase): string {
  if (phase === 'active') return 'ACTIVE';
  if (phase === 'completed') return 'COMPLETED';
  return 'PENDING';
}

function verdictToneClass(tone: AsianSessionVerdict['tone']): string {
  if (tone === 'complete') return 'text-emerald-700 dark:text-emerald-300';
  if (tone === 'skipped') return 'text-slate-600 dark:text-slate-400';
  if (tone === 'active') return 'text-blue-700 dark:text-blue-300';
  return 'text-amber-700 dark:text-amber-300';
}

function formatDetectionNetPips(netPips: number | null): string {
  if (netPips == null) return '—';
  const prefix = netPips > 0 ? '+' : '';
  return `${prefix}${netPips.toFixed(1)}p`;
}

function AsianDetailsPanel({
  amdState,
  activeDetection,
}: {
  amdState: AmdState | null;
  activeDetection?: AsianSessionDetection | null;
}) {
  return (
    <div className="space-y-2">
      {activeDetection && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
          <div>
            <dt className="text-slate-400">Condition</dt>
            <dd>{activeDetection.condition_fired ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Fired at</dt>
            <dd>{activeDetection.condition_check_time} UTC</dd>
          </div>
          <div>
            <dt className="text-slate-400">Net at detection</dt>
            <dd>{formatDetectionNetPips(activeDetection.detection_net_pips)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Candles checked</dt>
            <dd>{activeDetection.candle_count ?? '—'}</dd>
          </div>
        </dl>
      )}
      {amdState && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
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
            <dt className="text-slate-400">AMD evaluated</dt>
            <dd>{amdState.evaluated_at?.slice(11, 16) ?? '—'} UTC</dd>
          </div>
        </dl>
      )}
      {!activeDetection && !amdState && (
        <p className="text-xs text-slate-500">No detection data available.</p>
      )}
    </div>
  );
}

export function AsianSessionSection({
  phase,
  verdict,
  checklist,
  amdState,
  activeDetection,
}: AsianSessionSectionProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <section className={DIRECTION_COLUMN_CARD_CLASS}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Asian session
        </p>
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${sessionStatusBadgeClass(phase)}`}
        >
          {phaseLabel(phase)}
        </span>
      </div>

      <p className="mb-3 text-[10px] text-slate-400 dark:text-slate-500">00:00–08:00 UTC</p>

      <div className="mb-3">
        <p className={`text-sm font-bold ${verdictToneClass(verdict.tone)}`}>{verdict.headline}</p>
        <p className="text-xs text-slate-600 dark:text-slate-300">{verdict.subline}</p>
      </div>

      <div className="flex-1">
        <DirectionChecklist rows={checklist} />
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
          <AsianDetailsPanel amdState={amdState} activeDetection={activeDetection} />
        </div>
      )}
    </section>
  );
}
