'use client';

import { AsianSessionDirectionPill } from '@/components/asianSession/AsianSessionDirectionPill';
import type { OmegaWindowStatus } from '@/lib/fetchOmegaWindowStatus';

type DirectionStatusTileProps = {
  omegaWindow: OmegaWindowStatus | null;
};

function formatValidUntilUtc(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  const hh = parsed.getUTCHours().toString().padStart(2, '0');
  const mm = parsed.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

function resolveStatusBadge(omegaWindow: OmegaWindowStatus | null): {
  label: string;
  className: string;
} {
  if (!omegaWindow?.direction || omegaWindow.direction === 'neutral') {
    return {
      label: 'NOT SET',
      className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    };
  }
  if (omegaWindow.isActive) {
    return {
      label: 'ACTIVE',
      className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    };
  }
  return {
    label: 'EXPIRED',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  };
}

export function AsianSessionDirectionStatusTile({ omegaWindow }: DirectionStatusTileProps) {
  const direction =
    omegaWindow?.direction === 'long' || omegaWindow?.direction === 'short'
      ? omegaWindow.direction
      : null;
  const badge = resolveStatusBadge(omegaWindow);

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Omega direction window
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {direction ? <AsianSessionDirectionPill direction={direction} /> : (
          <span className="text-sm font-semibold text-slate-500">—</span>
        )}
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Valid until {formatValidUntilUtc(omegaWindow?.validUntil ?? null)}
      </div>
      <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        Pattern fire sets direction · separate from prior bias
      </div>
    </div>
  );
}
