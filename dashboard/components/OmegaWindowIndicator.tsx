'use client';
import { useOmegaWindowStatus } from '@/hooks/useOmegaWindowStatus';
import type { OmegaWindowType } from '@/lib/fetchOmegaWindowStatus';

// ─── display helpers ──────────────────────────────────────────────────────────

interface WindowTone {
  label: string;
  bg: string;
  text: string;
  dot: string;
}

function resolveWindowTone(windowType: OmegaWindowType, isActive: boolean): WindowTone {
  if (!isActive) {
    return {
      label: 'NO ACTIVE WINDOW',
      bg: 'bg-slate-100 dark:bg-slate-800',
      text: 'text-slate-500 dark:text-slate-400',
      dot: 'bg-slate-400',
    };
  }
  if (windowType === 'ASIAN') {
    return {
      label: 'ASIAN SESSION ACTIVE',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      text: 'text-emerald-700 dark:text-emerald-300',
      dot: 'bg-emerald-500',
    };
  }
  if (windowType === 'AMD') {
    return {
      label: 'AMD WINDOW ACTIVE',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      text: 'text-blue-700 dark:text-blue-300',
      dot: 'bg-blue-500',
    };
  }
  return {
    label: 'WINDOW ACTIVE',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  };
}

function resolveDirectionLabel(direction: string | null): string {
  if (direction === 'long') return 'LONG ↑';
  if (direction === 'short') return 'SHORT ↓';
  return '—';
}

function resolveDirectionColor(direction: string | null): string {
  if (direction === 'long') return 'text-emerald-600 dark:text-emerald-400';
  if (direction === 'short') return 'text-red-600 dark:text-red-400';
  return 'text-slate-500 dark:text-slate-400';
}

function resolveWindowRangeLabel(windowType: OmegaWindowType): string {
  if (windowType === 'ASIAN') return 'Asian 21:00–08:00 UTC';
  if (windowType === 'AMD') return 'AMD entry–14:00 UTC';
  return '—';
}

function formatExpiryTime(validUntil: string | null): string | null {
  if (!validUntil) return null;
  const d = new Date(validUntil);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

// ─── skeleton state ───────────────────────────────────────────────────────────

function OmegaWindowLoading() {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-sm text-slate-500 dark:text-slate-300">
      Loading Omega window status…
    </div>
  );
}

// ─── panel ────────────────────────────────────────────────────────────────────

export function OmegaWindowIndicator() {
  const { status, loading } = useOmegaWindowStatus();

  if (loading || !status) return <OmegaWindowLoading />;

  const { label, bg, text, dot } = resolveWindowTone(status.windowType, status.isActive);
  const expiryTime = formatExpiryTime(status.validUntil);

  return (
    <div className={`rounded-lg border border-slate-200 dark:border-slate-700 ${bg} px-4 py-3`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
          <span className={`text-xs font-semibold tracking-wide ${text}`}>{label}</span>
        </div>
        {status.minutesRemaining != null && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {status.minutesRemaining}m remaining
          </span>
        )}
      </div>

      <div className="flex items-center gap-6">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Direction</p>
          <p className={`text-sm font-bold ${resolveDirectionColor(status.direction)}`}>
            {resolveDirectionLabel(status.direction)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Window</p>
          <p className={`text-sm font-semibold ${text}`}>
            {resolveWindowRangeLabel(status.windowType)}
          </p>
        </div>
        {expiryTime && (
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Expires</p>
            <p className="text-sm font-mono text-slate-600 dark:text-slate-300">{expiryTime}</p>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        Omega only fires within active windows — silent outside Asian and AMD distribution hours
      </p>
    </div>
  );
}
