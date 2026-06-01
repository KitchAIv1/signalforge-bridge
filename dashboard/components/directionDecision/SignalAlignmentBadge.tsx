'use client';

import type { AlignmentKind, AlignmentSummary } from '@/lib/directionDecisionLogic';
import { IconAlertTriangle, IconCheck } from '@/lib/directionDecisionTablerIcons';

interface SignalAlignmentBadgeProps {
  alignment: AlignmentSummary;
}

function alignmentLabel(kind: AlignmentKind): string {
  if (kind === 'unanimous') return 'UNANIMOUS';
  if (kind === 'split') return 'SPLIT';
  if (kind === 'blocked') return 'BLOCKED';
  return 'NEUTRAL';
}

function alignmentTone(kind: AlignmentKind): string {
  if (kind === 'unanimous') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300';
  }
  if (kind === 'split') {
    return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300';
  }
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300';
}

export function SignalAlignmentBadge({ alignment }: SignalAlignmentBadgeProps) {
  const Icon = alignment.kind === 'unanimous' ? IconCheck : IconAlertTriangle;

  return (
    <div className={`rounded-lg border px-3 py-2 ${alignmentTone(alignment.kind)}`}>
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wide">
        <Icon size={14} />
        <span>ALIGNMENT: {alignmentLabel(alignment.kind)}</span>
      </div>
      {(alignment.longLabels.length > 0 ||
        alignment.shortLabels.length > 0 ||
        alignment.neutralLabels.length > 0) && (
        <div className="mt-1.5 space-y-0.5 text-xs">
          {alignment.longLabels.length > 0 && (
            <p>LONG signals: {alignment.longLabels.join(', ')}</p>
          )}
          {alignment.shortLabels.length > 0 && (
            <p>SHORT signals: {alignment.shortLabels.join(', ')}</p>
          )}
          {alignment.neutralLabels.length > 0 && (
            <p>NEUTRAL: {alignment.neutralLabels.join(', ')}</p>
          )}
        </div>
      )}
    </div>
  );
}
