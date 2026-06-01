'use client';

import { IconCircleCheck, IconCircleX } from '@/lib/directionDecisionTablerIcons';

export interface DecisionVerificationProps {
  liveDirection: string | null;
  reconstructedDirection: string | null;
  match: boolean;
  available: boolean;
}

function formatDirectionLabel(direction: string | null): string {
  if (!direction) return '—';
  return direction.toUpperCase();
}

export function DecisionVerificationRow({
  liveDirection,
  reconstructedDirection,
  match,
  available,
}: DecisionVerificationProps) {
  if (!available) {
    return (
      <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Decision verification: pending (awaiting data)
        </p>
      </div>
    );
  }

  const statusLabel = match ? 'MATCH' : 'MISMATCH';
  const StatusIcon = match ? IconCircleCheck : IconCircleX;
  const statusClass = match
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
      <p className="text-xs text-slate-500 dark:text-slate-400">Decision verification</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          10:31 live:{' '}
          <span className="font-bold uppercase text-slate-800 dark:text-slate-100">
            {formatDirectionLabel(liveDirection)}
          </span>
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Reconstructed:{' '}
          <span className="font-bold uppercase text-slate-800 dark:text-slate-100">
            {formatDirectionLabel(reconstructedDirection)}
          </span>
        </span>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${statusClass}`}>
          <StatusIcon size={14} className="shrink-0" />
          {statusLabel}
        </span>
      </div>
      {!match && (
        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">Investigation needed</p>
      )}
    </div>
  );
}
