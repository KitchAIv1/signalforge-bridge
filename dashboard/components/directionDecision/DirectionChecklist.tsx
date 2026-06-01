'use client';

import type { ChecklistStatus } from '@/lib/directionDecisionLogic';
import {
  IconCheck,
  IconClock,
  IconMinus,
  IconX,
} from '@/lib/directionDecisionTablerIcons';

export interface DirectionChecklistItem {
  id: string;
  label: string;
  value: string;
  status: ChecklistStatus;
}

interface DirectionChecklistProps {
  rows: DirectionChecklistItem[];
}

function statusIcon(status: ChecklistStatus) {
  if (status === 'pass') {
    return <IconCheck size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />;
  }
  if (status === 'fail') {
    return <IconX size={14} className="text-red-600 dark:text-red-400 shrink-0" />;
  }
  if (status === 'warn') {
    return <IconMinus size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />;
  }
  if (status === 'pending') {
    return <IconClock size={14} className="text-slate-400 shrink-0" />;
  }
  return <IconMinus size={14} className="text-slate-400 shrink-0" />;
}

export function DirectionChecklist({ rows }: DirectionChecklistProps) {
  return (
    <ul className="space-y-1.5">
      {rows.map((row) => (
        <li key={row.id} className="flex items-start gap-2 text-xs">
          <span className="mt-0.5">{statusIcon(row.status)}</span>
          <span className="w-28 shrink-0 font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {row.label}
          </span>
          <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}
