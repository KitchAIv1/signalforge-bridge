'use client';

import type { Phase2AdvisoryDisplay } from '@/lib/phase2LaneAdvisoryFormat';

const BADGE_CLASS_BY_KIND: Record<Phase2AdvisoryDisplay['kind'], string> = {
  crack_entry: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  speedfloor_shadow: 'bg-violet-100 text-violet-900 dark:bg-violet-950/45 dark:text-violet-200',
  no_crack: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  already_open: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  invalid_direction: 'bg-rose-100 text-rose-900 dark:bg-rose-950/45 dark:text-rose-200',
  disabled_fallback: 'bg-orange-100 text-orange-900 dark:bg-orange-950/45 dark:text-orange-200',
  clear: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  r1_shadow: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  phase2_shadow: 'bg-orange-100 text-orange-900 dark:bg-orange-950/45 dark:text-orange-200',
  r1_live: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200',
  phase2_live: 'bg-rose-100 text-rose-900 dark:bg-rose-950/45 dark:text-rose-200',
};

interface Phase2LaneAdvisoryBadgeProps {
  display: Phase2AdvisoryDisplay;
}

export function Phase2LaneAdvisoryBadge({ display }: Phase2LaneAdvisoryBadgeProps) {
  const badgeClass = BADGE_CLASS_BY_KIND[display.kind];

  return (
    <div className="space-y-0.5">
      <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
        {display.label}
      </span>
      {display.detail ? (
        <p
          className="max-w-[200px] truncate text-[10px] text-slate-500 dark:text-slate-400"
          title={display.detail}
        >
          {display.detail}
        </p>
      ) : null}
    </div>
  );
}
