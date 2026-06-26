'use client';

import type { ReactNode } from 'react';
import { useOmegaWindowStatus } from '@/hooks/useOmegaWindowStatus';
import type { OmegaWindowType } from '@/lib/fetchOmegaWindowStatus';
import { OmegaExitReferenceModal } from '@/components/omegaExitReference/OmegaExitReferenceModal';

// ─── display helpers ──────────────────────────────────────────────────────────

interface ActiveTone {
  label: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
}

function resolveActiveTone(windowType: OmegaWindowType): ActiveTone {
  if (windowType === 'AMD') {
    return {
      label: 'AMD WINDOW ACTIVE',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-700',
      text: 'text-blue-700 dark:text-blue-300',
      dot: 'bg-blue-500',
    };
  }
  return {
    label: 'ASIAN SESSION ACTIVE',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-200 dark:border-emerald-700',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  };
}

function resolveDirectionLabel(direction: string | null): string {
  if (direction === 'long') return 'LONG ↑';
  if (direction === 'short') return 'SHORT ↓';
  return 'NEUTRAL';
}

function resolveDirectionColor(direction: string | null): string {
  if (direction === 'long') return 'text-emerald-600 dark:text-emerald-400';
  if (direction === 'short') return 'text-red-600 dark:text-red-400';
  return 'text-slate-500 dark:text-slate-400';
}

function resolveWindowRangeLabel(windowType: OmegaWindowType): string {
  if (windowType === 'ASIAN') return 'Asian  21:00 – 08:00 UTC';
  if (windowType === 'AMD') return 'Distribution 10:31 – 16:00 UTC';
  return '—';
}

function formatHhmUtc(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

// ─── loading skeleton ─────────────────────────────────────────────────────────

function OmegaWindowLoading() {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-sm text-slate-500 dark:text-slate-300">
      Loading Omega window status…
    </div>
  );
}

// ─── active state panel ───────────────────────────────────────────────────────

interface ActiveProps {
  direction: string | null;
  windowType: OmegaWindowType;
  validUntil: string | null;
  minutesRemaining: number | null;
}

function OmegaWindowActive({ direction, windowType, validUntil, minutesRemaining }: ActiveProps) {
  const tone = resolveActiveTone(windowType);
  const expiryTime = formatHhmUtc(validUntil);

  return (
    <div className={`rounded-lg border ${tone.border} ${tone.bg} px-4 py-3`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${tone.dot}`} />
          <span className={`text-xs font-semibold tracking-wide ${tone.text}`}>{tone.label}</span>
        </div>
        {minutesRemaining != null && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {minutesRemaining}m remaining
          </span>
        )}
      </div>

      <div className="flex items-center gap-6">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Direction</p>
          <p className={`text-sm font-bold ${resolveDirectionColor(direction)}`}>
            {resolveDirectionLabel(direction)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Window</p>
          <p className={`text-sm font-semibold ${tone.text}`}>
            {resolveWindowRangeLabel(windowType)}
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
        Omega fires within this window only
      </p>
    </div>
  );
}

// ─── silent / no-window state panel ──────────────────────────────────────────

interface SilentProps {
  direction: string | null;
  validUntil: string | null;
}

function OmegaWindowSilent({ direction, validUntil }: SilentProps) {
  const expiredTime = formatHhmUtc(validUntil);
  const lastDirectionText =
    direction && direction !== 'neutral'
      ? `Last direction: ${direction}${expiredTime ? ` (expired ${expiredTime})` : ''}`
      : null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" />
        <span className="text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
          OMEGA SILENT
        </span>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300">No active session window.</p>

      {lastDirectionText && (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{lastDirectionText}</p>
      )}

      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        Omega resumes at next AMD_SHIFTED Asian open
      </p>
    </div>
  );
}

// ─── public export ────────────────────────────────────────────────────────────

function OmegaWindowPanel({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute right-3 top-3 z-10">
        <OmegaExitReferenceModal />
      </div>
      {children}
    </div>
  );
}

function OmegaWindowRaw() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/20 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
        <span className="text-xs font-semibold tracking-wide text-amber-800 dark:text-amber-300">
          RAW MODE ACTIVE
        </span>
      </div>
      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
        Fires on DTW match only
      </p>
      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
        Direction, window, and threshold gates bypassed.
        News filter and circuit breaker always on.
      </p>
    </div>
  );
}

export function OmegaWindowIndicator({ rawMode = false }: { rawMode?: boolean }) {
  const { status, loading } = useOmegaWindowStatus();

  if (rawMode) {
    return (
      <OmegaWindowPanel>
        <OmegaWindowRaw />
      </OmegaWindowPanel>
    );
  }

  if (loading || !status) {
    return (
      <OmegaWindowPanel>
        <OmegaWindowLoading />
      </OmegaWindowPanel>
    );
  }

  if (!status.isActive) {
    return (
      <OmegaWindowPanel>
        <OmegaWindowSilent direction={status.direction} validUntil={status.validUntil} />
      </OmegaWindowPanel>
    );
  }

  return (
    <OmegaWindowPanel>
      <OmegaWindowActive
        direction={status.direction}
        windowType={status.windowType}
        validUntil={status.validUntil}
        minutesRemaining={status.minutesRemaining}
      />
    </OmegaWindowPanel>
  );
}
